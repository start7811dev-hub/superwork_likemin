/**
 * MPM 파이프라인 (자동화 공정).
 *
 *  inbox → intake(맥락 캔버스 · 의도가 불분명할 때만 비유로 질문)
 *        → dispatch(업무 분장 · MPM의 모델 위임)
 *        → worker:* (병렬: Factbook 전방위 조사 + 업무) ⇄ audit(믿지 않는 검수, 반려 시 재작업)
 *        → factbook(통합) → simulate(타깃 시뮬레이션)
 *        → insight(SUPER INSIGHT: AARRR·TOWS·STP 2.0·CDJ → MIN'S 4-3-2 THINKING)
 *        → synthesize(최소 3개 대안 · 일단 결과부터)
 *        → review(재검증) → refine(최종 검증 A · 고도화) → clone(최종 검증 B · MPM 클론, 직권 지시 1회)
 *        → deliver
 *
 * 모든 진행 상황은 PipelineEvent로 렌더러에 전달되어 공정 시각화를 구동한다.
 */
import { randomUUID } from 'node:crypto'
import {
  type ChallengeQuestion,
  AuditResultSchema,
  CloneReviewSchema,
  ContextCanvasSchema,
  FactbookSchema,
  InsightSchema,
  ReviewSchema,
  type Factbook,
  type Method,
  type ProcessPlan,
  type Synthesis,
  DispatchPlanSchema,
  SimulationSchema,
  SynthesisSchema,
  WorkerReportSchema,
  type TaskSpec,
  type Insight,
  type Simulation,
  METHODS
} from '../../shared/schemas'
import {
  DEPTH_EFFORT,
  type Depth,
  type NodeStatus,
  type PacketKind,
  type PipelineEvent,
  type RoleDef,
  type RunRecord,
  type Settings,
  type TaskRun
} from '../../shared/types'
import { brainContext, loadBrain, memoryContext } from '../brain/loader'
import { saveRun } from '../store/runs'
import { ClaudeEngine, PipelineCancelled, type McpServer } from './claude'
import { collectMaterials, textDigest, toBlocks } from '../materials'
import { getSecret } from '../secrets'
import { DemoEngine } from './demo'
import * as P from './prompts'

const MAX_TASKS = 6

export interface StartArgs {
  /** 없으면 데모 엔진으로 실행 */
  apiKey: string | null
  settings: Settings
  brief: string
  depth: Depth
  /** 첨부 파일 경로 (최대 5개) */
  attachments?: string[]
  emit: (e: PipelineEvent) => void
}

const active = new Map<string, AbortController>()
const pendingAnswers = new Map<string, (a: string[] | null) => void>()

export function cancelRun(id: string): void {
  active.get(id)?.abort()
}

/** 질문 게이트 응답. null = 가정대로 진행 */
export function answerRun(id: string, answers: string[] | null): void {
  pendingAnswers.get(id)?.(answers)
  pendingAnswers.delete(id)
}

function waitForAnswer(id: string, signal: AbortSignal): Promise<string[] | null> {
  return new Promise((resolve, reject) => {
    pendingAnswers.set(id, resolve)
    signal.addEventListener('abort', () => {
      pendingAnswers.delete(id)
      reject(new PipelineCancelled())
    })
  })
}

/** 동시 실행 수를 제한한 병렬 처리 */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    while (queue.length) await fn(queue.shift()!)
  })
  await Promise.all(workers)
}

export function startRun(args: StartArgs): string {
  const id = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`
  const controller = new AbortController()
  active.set(id, controller)
  void execute(id, args, controller.signal).finally(() => active.delete(id))
  return id
}

async function execute(runId: string, args: StartArgs, signal: AbortSignal): Promise<void> {
  const { settings, emit } = args
  const brain = loadBrain()
  const effort = DEPTH_EFFORT[args.depth]
  const models = settings.models
  const roles = new Map<string, RoleDef>(brain.roles.map((r) => [r.id, r]))

  /** MPM의 위임 판단(tier)을 실제 모델로. 위임 권한이 꺼져 있으면 설정값 범위 안에서만. */
  const modelFor = (tier: TaskSpec['tier']) =>
    settings.delegation ? models[tier] : tier === 'mpm' ? models.worker : models[tier]

  const run: RunRecord = {
    id: runId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: args.brief.split('\n')[0].slice(0, 40) || '새 업무',
    brief: args.brief,
    depth: args.depth,
    status: 'running',
    brainVersion: brain.version,
    demo: !args.apiKey,
    tasks: {},
    usage: {},
    log: []
  }

  const node = (nodeId: string, status: NodeStatus, detail?: string) => emit({ type: 'node', runId, nodeId, status, detail })
  const packet = (from: string, to: string, kind: PacketKind) => emit({ type: 'packet', runId, from, to, kind })
  const log = (nodeId: string, text: string, level: 'info' | 'warn' | 'error' = 'info') => {
    run.log.push({ at: new Date().toISOString(), nodeId, text, level })
    emit({ type: 'log', runId, nodeId, text, level })
  }
  const persist = () => {
    saveRun(run)
    emit({ type: 'record', runId, record: run })
  }

  const onUsage = (usage: RunRecord['usage']) => {
    run.usage = structuredClone(usage)
    emit({ type: 'usage', runId, usage: run.usage })
  }
  const engine = args.apiKey ? new ClaudeEngine(args.apiKey, onUsage, { runId, kind: 'run' }) : new DemoEngine(onUsage)
  if (!args.apiKey) log('inbox', '데모 모드: API를 호출하지 않고 준비된 결과로 공정을 시연합니다.', 'warn')

  // 시스템 프롬프트: [두뇌(캐시)] + [참고 자료 텍스트(캐시)] + [과거 결정 메모리] + [역할 지시]
  const brainBlock = { type: 'text' as const, text: brainContext(brain), cache_control: { type: 'ephemeral' as const } }
  const memory = memoryContext(brain)
  const lang = settings.language === 'en' ? 'Respond in English.' : '모든 내용은 한국어로 작성한다.'
  let materialBlock: { type: 'text'; text: string; cache_control: { type: 'ephemeral' } } | null = null
  const system = (role: string) => [
    brainBlock,
    ...(materialBlock ? [materialBlock] : []),
    { type: 'text' as const, text: [memory, role, lang].filter(Boolean).join('\n\n') }
  ]
  const mcp: McpServer[] = settings.mcpServers
    .filter((m) => m.enabled && m.url)
    .map((m) => ({ name: m.name.replace(/[^\w-]/g, '_').slice(0, 60) || 'mcp', url: m.url, token: getSecret(`mcp:${m.name}`) }))

  const validateSynthesis = (s: Synthesis) => {
    if (s.alternatives.length < 3) return `대안이 ${s.alternatives.length}개뿐이다. 본질적으로 다른 대안을 최소 3개 제시하라.`
    if (!s.alternatives.some((a) => a.id === s.recommendation.pick)) return 'recommendation.pick이 대안 id와 일치하지 않는다.'
    return null
  }

  emit({ type: 'run', runId, status: 'started' })
  persist()

  try {
    /* ---- 0. 참고 자료: 첨부 파일 + 링크 ---- */
    node('inbox', 'running', '자료 확인 중')
    const collected = await collectMaterials(args.attachments ?? [], args.brief, (msg) => log('inbox', msg))
    if (signal.aborted) throw new PipelineCancelled()
    run.materials = collected.items.map((m) => ({ source: m.source, kind: m.kind, note: m.note }))
    run.materialErrors = collected.errors
    for (const e of collected.errors) log('inbox', `자료를 읽지 못함: ${e}`, 'warn')
    const digest = textDigest(collected.items)
    if (digest) materialBlock = { type: 'text', text: digest, cache_control: { type: 'ephemeral' } }
    const intakeBlocks = toBlocks(collected.items)
    if (collected.items.length) log('inbox', `참고 자료 ${collected.items.length}건 — MPM이 맥락 설계에서 직접 검토합니다`)

    /* ---- 1. INTAKE ---- */
    node('inbox', 'done', collected.items.length ? `업무 접수 · 자료 ${collected.items.length}건` : '업무 접수')
    packet('inbox', 'intake', 'brief')
    node('intake', 'running', '의도 파악 · 맥락 설계 중')
    log('intake', 'MPM이 요청을 분석합니다. 판단 엔진이 MIN 문서를 근거로 추론합니다.')
    const intake = (qa?: P.QA[]) =>
      engine.structured({
        model: models.mpm,
        system: system(P.ROLE.intake),
        user: intakeBlocks.length ? [...intakeBlocks, { type: 'text' as const, text: P.intakeUser(args.brief, qa) }] : P.intakeUser(args.brief, qa),
        effort: effort.mpm,
        signal,
        schema: ContextCanvasSchema
      })
    let canvas = await intake()
    run.canvas = canvas
    log('intake', `판단: ${canvas.judgment.decision}`)
    persist()

    /* ---- 1.5 의도 질문: 의도가 정말 불분명할 때만, 비유로 ---- */
    const questions = canvas.intent.questions.slice(0, 3)
    const ask =
      questions.length > 0 &&
      settings.askMode !== 'never' &&
      (settings.askMode === 'always' || !canvas.intent.clear)
    if (ask) {
      node('intake', 'waiting', `의도 질문 ${questions.length}건`)
      log('intake', `의도가 분명하지 않아 MIN에게 비유로 묻습니다: ${questions.map((q) => q.question).join(' / ')}`, 'warn')
      emit({ type: 'questions', runId, reading: canvas.intent.reading, questions })
      const answers = await waitForAnswer(runId, signal)
      const qa = questions.map((q, i) => ({
        question: q.question,
        answer: answers?.[i]?.trim() || `(답변 없음 — 가정: ${q.ifUnanswered})`
      }))
      run.answers = qa
      run.answersSkipped = qa.every((x) => x.answer.startsWith('(답변 없음'))
      if (!run.answersSkipped) {
        node('intake', 'running', '답변을 반영해 맥락 재설계 중')
        canvas = await intake(qa)
        run.canvas = canvas
      }
      log('intake', run.answersSkipped ? 'MIN이 가정대로 진행하라고 했습니다.' : 'MIN의 답을 반영했습니다.')
    } else {
      log('intake', `의도 파악 완료 — 확인 없이 진행: ${canvas.intent.reading}`)
    }
    run.title = canvas.title
    log('intake', `실제 문제: ${canvas.reframe.realProblem}`)

    /* ---- 1.6 공정 설계: MPM이 E2E 관점에서 규모·구성을 정한다 (doctrine §0.10) ---- */
    const ALL_METHODS: Method[] = ['aarrr', 'tows', 'stp', 'cdj', 'jtbd', 'unit', 'competition']
    const proc: ProcessPlan =
      settings.processMode === 'full'
        ? {
            ...canvas.process,
            scale: 'full',
            maxTasks: MAX_TASKS,
            factbook: { mode: 'full', reason: '설정: 항상 전체 공정' },
            simulate: { run: true, reason: '설정: 항상 전체 공정' },
            methods: ALL_METHODS,
            refine: { run: true, reason: '설정: 항상 전체 공정' },
            clone: { run: true, reason: '설정: 항상 전체 공정' }
          }
        : canvas.process
    proc.methods = [...new Set(proc.methods)].filter((m) => ALL_METHODS.includes(m))
    canvas.process = proc
    const skip = (nodeId: string, reason: string) => {
      node(nodeId, 'skipped', `생략 · ${reason}`)
      log(nodeId, `생략: ${reason}`)
    }
    log(
      'intake',
      `공정 설계(${proc.scale}): 담당 ${proc.maxTasks}명 · Factbook ${proc.factbook.mode} · 방법론 ${proc.methods.length ? proc.methods.join('/') : '없음'} · 시뮬레이션 ${proc.simulate.run ? 'O' : 'X'} · 고도화 ${proc.refine.run ? 'O' : 'X'} · 클론 ${proc.clone.run ? 'O' : 'X'} — ${proc.rationale}`
    )
    node('intake', 'done', canvas.title)
    persist()

    /* ---- 2. DISPATCH (모델 위임 포함) ---- */
    packet('intake', 'dispatch', 'canvas')
    node('dispatch', 'running', '업무 계약 · 모델 위임 판단 중')
    const plan = await engine.structured({
      model: models.mpm,
      system: system(P.ROLE.dispatch),
      user: P.dispatchUser(canvas, brain.roles, Math.min(MAX_TASKS, Math.max(1, Math.round(proc.maxTasks) || 1))),
      effort: effort.mpm,
      signal,
      schema: DispatchPlanSchema,
      validate: (p) => {
        if (!p.tasks.length) return '작업이 하나도 없다. 최소 1개 이상 분장하라.'
        const bad = p.tasks.filter((t) => !roles.has(t.roleId)).map((t) => t.roleId)
        return bad.length ? `roster에 없는 역할 id: ${bad.join(', ')}. roster의 id만 사용하라.` : null
      }
    })
    const seen = new Set<string>()
    plan.tasks = plan.tasks.slice(0, Math.min(MAX_TASKS, Math.max(1, Math.round(proc.maxTasks) || 1))).map((t, i) => {
      const id = seen.has(t.id) || !/^[\w-]+$/.test(t.id) ? `t${i + 1}` : t.id
      seen.add(id)
      return { ...t, id }
    })
    run.plan = plan
    for (const t of plan.tasks) run.tasks[t.id] = { task: t, rounds: [], status: 'queued', model: modelFor(t.tier) }
    emit({ type: 'workers', runId, tasks: plan.tasks })
    log('dispatch', `${plan.tasks.length}개 업무로 분장: ${plan.tasks.map((t) => `${t.title}(${t.tier})`).join(' · ')}`)
    for (const t of plan.tasks) if (t.tier === 'mpm') log('dispatch', `위임 판단: "${t.title}"은 최상위 모델에 맡김 — ${t.tierReason}`)
    node('dispatch', 'done', `${plan.tasks.length}개 업무 분장`)
    persist()

    /* ---- 3. FACTBOOK 조사 + WORK ⇄ AUDIT ---- */
    const auditing = new Set<string>()
    const setAudit = (taskId: string, on: boolean) => {
      if (on) auditing.add(taskId)
      else auditing.delete(taskId)
      node('audit', auditing.size ? 'running' : 'idle', auditing.size ? `${auditing.size}건 검수 중` : undefined)
    }

    const runTask = async (task: TaskSpec) => {
      const role = roles.get(task.roleId)!
      const nodeId = `worker:${task.id}`
      const tr: TaskRun = run.tasks[task.id]
      const model = tr.model ?? models.worker
      packet('dispatch', nodeId, 'task')

      // 3-a. 업무와 별개로 Factbook 조사 — MPM의 공정 설계에 따라 full / light / skip
      const researchRoles = plan.tasks.filter((t) => roles.get(t.roleId)?.research)
      const doFactbook =
        proc.factbook.mode === 'full' ||
        (proc.factbook.mode === 'light' && (researchRoles.length ? role.research : task.id === plan.tasks[0].id))
      if (doFactbook) node(nodeId, 'running', 'Factbook 조사 중')
      if (doFactbook) try {
        const notes = await engine.research(
          {
            model: models.worker,
            system: system(P.ROLE.research(role)),
            user: P.factbookResearchUser(canvas, task, args.brief),
            effort: 'medium',
            signal
          },
          settings.webResearch,
          mcp
        )
        tr.factbook = await engine.structured({
          model: models.light,
          system: system(P.ROLE.factbookExtract),
          user: P.factbookExtractUser(notes),
          effort: 'low',
          signal,
          schema: FactbookSchema
        })
        packet(nodeId, 'factbook', 'fact')
        log(nodeId, `${role.name} Factbook: 사실 ${tr.factbook.facts.length} · 제품 ${tr.factbook.products.length} · 경쟁사 ${tr.factbook.competitors.length}`)
      } catch (err) {
        if (err instanceof PipelineCancelled) throw err
        log(nodeId, `Factbook 조사 실패, 업무는 계속 진행: ${(err as Error).message}`, 'warn')
      }

      // 3-b. 업무 ⇄ 검수
      for (let round = 0; round <= settings.maxRework; round++) {
        const prev = tr.rounds[tr.rounds.length - 1]
        node(nodeId, 'running', round === 0 ? '작업 중' : `재작업 ${round}회차`)
        const report = await engine.structured({
          model,
          system: system(P.ROLE.worker(role)),
          user: P.workerUser(canvas, task, tr.factbook, prev?.audit ? { previous: prev.report, audit: prev.audit } : undefined),
          effort: effort.worker,
          signal,
          schema: WorkerReportSchema
        })
        const entry: TaskRun['rounds'][number] = { report }
        tr.rounds.push(entry)
        node(nodeId, 'done', '보고 제출')
        packet(nodeId, 'audit', 'report')
        log(nodeId, `${role.name} 보고: ${report.summary.slice(0, 120)}`)

        setAudit(task.id, true)
        const isLast = round === settings.maxRework
        const audit = await engine.structured({
          model: models.mpm,
          system: system(P.ROLE.audit),
          user: P.auditUser(canvas, task, report, round, isLast),
          effort: effort.audit,
          signal,
          schema: AuditResultSchema
        })
        entry.audit = audit
        setAudit(task.id, false)
        persist()

        const high = audit.issues.filter((i) => i.severity === 'high').length
        if (audit.verdict === 'rework' && !isLast) {
          tr.status = 'rework'
          node(nodeId, 'rework', `반려 · 신뢰도 ${audit.trustScore}`)
          log('audit', `[반려] ${task.title} — 신뢰도 ${audit.trustScore}, 중대 지적 ${high}건: ${audit.reworkInstruction.slice(0, 140)}`, 'warn')
          packet('audit', nodeId, 'rework')
          continue
        }
        tr.status = 'done'
        node(nodeId, 'done', `승인 · 신뢰도 ${audit.trustScore}`)
        log('audit', `[승인] ${task.title} — 신뢰도 ${audit.trustScore}, 인사이트 ${audit.keptInsights.length}개 채택`)
        packet('audit', 'factbook', 'approved')
        break
      }
    }
    // 담당 하나가 끝내 실패해도 공정 전체를 멈추지 않는다 — 그 담당만 오류로 두고 나머지로 계속
    await pool(plan.tasks, settings.maxParallel, async (task: TaskSpec) => {
      try {
        await runTask(task)
      } catch (err) {
        if (err instanceof PipelineCancelled || signal.aborted) throw err
        const tr = run.tasks[task.id]
        tr.status = 'error'
        node(`worker:${task.id}`, 'error', '실패 — 나머지로 계속')
        log(`worker:${task.id}`, `${task.title} 실패, 이 담당 없이 계속 진행: ${(err as Error).message.slice(0, 200)}`, 'error')
        if (auditing.has(task.id)) setAudit(task.id, false)
        persist()
      }
    })
    const okTasks = plan.tasks.filter((t) => run.tasks[t.id].rounds.some((r) => r.audit))
    if (!okTasks.length) throw new Error('모든 하위 담당이 실패해 종합할 재료가 없습니다.')
    node('audit', 'done', '검수 완료')

    /* ---- 4. FACTBOOK 통합 ---- */
    const books = plan.tasks.filter((t) => run.tasks[t.id].factbook).map((t) => ({ from: t.title, book: run.tasks[t.id].factbook as Factbook }))
    if (proc.factbook.mode === 'skip') {
      skip('factbook', proc.factbook.reason)
    } else if (books.length) {
      node('factbook', 'running', `${books.length}권 통합 중`)
      run.factbook =
        books.length === 1
          ? books[0].book
          : await engine.structured({
              model: models.worker,
              system: system(P.ROLE.factbookMerge),
              user: P.factbookMergeUser(books),
              effort: 'medium',
              signal,
              maxTokens: 64000,
              schema: FactbookSchema
            })
      log('factbook', `미션 Factbook: 사실 ${run.factbook.facts.length} · 데이터 ${run.factbook.datasets.length} · 제품 ${run.factbook.products.length} · 경쟁사 ${run.factbook.competitors.length}`)
      node('factbook', 'done', `사실 ${run.factbook.facts.length}건`)
      persist()
    } else {
      node('factbook', 'error', 'Factbook 없음')
    }

    /* ---- 5. SIMULATE ---- */
    const taskRuns = okTasks.map((t) => run.tasks[t.id])
    packet('factbook', 'simulate', 'fact')
    let simulation: Simulation | undefined
    if (!proc.simulate.run) {
      skip('simulate', proc.simulate.reason)
    } else {
    node('simulate', 'running', '엣지 타깃 행동 예측 중')
    simulation = await engine.structured({
      model: models.worker,
      system: system(P.ROLE.simulate),
      user: P.simulateUser(canvas, taskRuns),
      effort: effort.worker === 'low' ? 'medium' : effort.worker,
      signal,
      schema: SimulationSchema
    })
    run.simulation = simulation
    log('simulate', `페르소나 ${simulation.personas.length}명, 엣지 케이스 ${simulation.edgeCases.length}건 시뮬레이션`)
    node('simulate', 'done', `페르소나 ${simulation.personas.length}`)
    persist()
    }

    /* ---- 6. SUPER INSIGHT: 대안을 내기 전에 4-3-2를 찍고 간다 ---- */
    packet('simulate', 'insight', 'insight')
    let insight: Insight | undefined
    if (!proc.methods.length) {
      skip('insight', proc.methodsReason || '방법론 분석이 결과를 바꾸지 않는 과제')
    } else {
    const has = (m: Method) => proc.methods.includes(m)
    node('insight', 'running', `${proc.methods.map((m) => METHODS[m]).join(' · ')} 분석 중`)
    insight = await engine.structured({
      model: models.mpm,
      system: system(P.ROLE.insight),
      user: P.insightUser(canvas, taskRuns, proc.methods, simulation, run.factbook),
      effort: effort.mpm,
      signal,
      maxTokens: 48000,
      schema: InsightSchema,
      validate: (i) => {
        const bad: string[] = []
        if (has('aarrr') && i.aarrr.length !== 5) bad.push(`AARRR는 5단계여야 한다 (현재 ${i.aarrr.length})`)
        if (has('cdj') && i.cdj.length !== 4) bad.push(`CDJ는 4단계여야 한다 (현재 ${i.cdj.length})`)
        if (has('tows') && !i.tows.so.length && !i.tows.wo.length) bad.push('TOWS 교차 전략이 비어 있다')
        if (has('stp') && !i.stp.segments.length) bad.push('STP 세그먼트가 비어 있다')
        if (has('jtbd') && !i.jtbd.length) bad.push('JTBD가 비어 있다')
        if (has('unit') && !i.unit.assumptions.length) bad.push('유닛 이코노믹스 가정이 비어 있다')
        if (has('competition') && !i.competition.players.length) bad.push('경쟁 구도가 비어 있다')
        if (i.superStrategies.length !== 4) bad.push(`SUPER STRATEGIES는 정확히 4개 (현재 ${i.superStrategies.length})`)
        if (i.ksf.length !== 3) bad.push(`KSF는 정확히 3개 (현재 ${i.ksf.length})`)
        if (i.keyClaims.length !== 2) bad.push(`CORE KEY-CLAIMS는 정확히 2개 (현재 ${i.keyClaims.length})`)
        return bad.length ? bad.join(' / ') : null
      }
    })
    run.insight = insight
    log('insight', `2 CORE KEY-CLAIMS: ${insight.keyClaims.map((k) => k.claim).join(' / ')}`)
    node('insight', 'done', '4-3-2 확정')
    persist()
    }

    /* ---- 7. SYNTHESIZE: 성미 급한 MPM은 일단 결과부터 ---- */
    packet('insight', 'synthesize', 'insight')
    node('synthesize', 'running', '일단 결과부터!')
    let result = await engine.structured({
      model: models.mpm,
      system: system(P.ROLE.synthesize),
      user: P.synthesizeUser(canvas, plan, taskRuns, simulation, run.answers, run.factbook, insight),
      effort: effort.mpm,
      signal,
      maxTokens: 64000,
      schema: SynthesisSchema,
      validate: validateSynthesis
    })
    const verification: NonNullable<RunRecord['verification']> = { versions: [] }
    run.verification = verification
    const commit = (label: string) => {
      run.synthesis = result
      verification.versions.push({ label, at: new Date().toISOString() })
      persist()
    }
    commit('초안')
    log('synthesize', `초안: 대안 ${result.alternatives.length}개 · 조건부 추천 ${result.recommendation.pick}`)
    node('synthesize', 'done', `초안 · 대안 ${result.alternatives.length}개`)

    const revise = (instructions: string) =>
      engine.structured({
        model: models.mpm,
        system: system(P.ROLE.revise),
        user: P.reviseUser(canvas, result, instructions, run.factbook),
        effort: effort.mpm,
        signal,
        maxTokens: 64000,
        schema: SynthesisSchema,
        validate: validateSynthesis
      })

    /* ---- 7. 재검증 (1회) ---- */
    packet('synthesize', 'review', 'final')
    node('review', 'running', '다시 한번 고민 중')
    const review = await engine.structured({
      model: models.mpm,
      system: system(P.ROLE.review),
      user: P.reviewUser(canvas, result, run.factbook),
      effort: effort.audit,
      signal,
      schema: ReviewSchema
    })
    verification.review = review
    if (review.verdict === 'improve' && review.issues.length) {
      node('review', 'running', `개선 ${review.issues.length}건 반영 중`)
      log('review', `재검증: 개선 ${review.issues.length}건 — ${review.issues.map((i) => i.target).join(', ')}`)
      result = await revise(P.reviewToInstructions(review))
      commit('재검증 반영')
    } else {
      log('review', '재검증: 수정 없이 유지')
      persist()
    }
    node('review', 'done', review.verdict === 'improve' ? `개선 ${review.issues.length}건` : '유지')

    /* ---- 8. 최종 검증 A: 고도화 ---- */
    packet('review', 'refine', 'final')
    if (!proc.refine.run) {
      skip('refine', proc.refine.reason)
    } else {
    node('refine', 'running', '디테일 고도화 검증 중')
    const refine = await engine.structured({
      model: models.mpm,
      system: system(P.ROLE.refine),
      user: P.refineUser(canvas, result, review, run.factbook),
      effort: effort.audit,
      signal,
      schema: ReviewSchema
    })
    verification.refine = refine
    if (refine.verdict === 'improve' && refine.issues.length) {
      node('refine', 'running', `디테일 ${refine.issues.length}건 고도화 중`)
      log('refine', `고도화: 디테일 ${refine.issues.length}건`)
      result = await revise(P.reviewToInstructions(refine))
      commit('고도화')
    } else {
      log('refine', '고도화: 추가 디테일 없음')
      persist()
    }
    node('refine', 'done', refine.verdict === 'improve' ? `고도화 ${refine.issues.length}건` : '유지')
    }

    /* ---- 9. 최종 검증 B: MPM 클론 (거시 디렉터, 직권 지시 1회) ---- */
    packet('refine', 'clone', 'final')
    if (!proc.clone.run) {
      skip('clone', proc.clone.reason)
    } else {
    node('clone', 'running', '숲을 보는 중')
    const clone = await engine.structured({
      model: models.mpm,
      system: system(P.ROLE.clone),
      user: P.cloneUser(canvas, result, simulation, insight),
      effort: effort.mpm,
      signal,
      schema: CloneReviewSchema
    })
    verification.clone = clone
    log('clone', `MPM 클론의 통찰: ${clone.insight}`)
    if (clone.bigIssue && clone.directive.trim()) {
      node('clone', 'running', '직권 지시!')
      packet('clone', 'synthesize', 'directive')
      log('clone', `직권 지시: ${clone.directive}`, 'warn')
      result = await revise(P.cloneToInstructions(clone))
      commit('클론 직권 지시 반영')
    } else {
      persist()
    }
    node('clone', 'done', clone.bigIssue ? '직권 지시 반영' : '통합 검증 통과')
    }

    /* ---- 10. DELIVER ---- */
    packet('clone', 'deliver', 'final')
    node('deliver', 'done', `최종 · ${verification.versions.length}번 다듬음`)
    run.status = 'done'
    persist()
    emit({ type: 'run', runId, status: 'done' })
  } catch (err) {
    if (err instanceof PipelineCancelled || signal.aborted) {
      run.status = 'cancelled'
      log('deliver', '사용자가 실행을 중단했습니다.', 'warn')
      persist()
      emit({ type: 'run', runId, status: 'cancelled' })
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    run.status = 'error'
    run.error = message
    log('deliver', message, 'error')
    persist()
    emit({ type: 'run', runId, status: 'error', error: message })
  }
}
