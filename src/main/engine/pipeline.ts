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
  BriefReviewSchema,
  BriefSchema,
  CandidatesSchema,
  ContextCanvasSchema,
  DeliverableSchema,
  DocTasteSchema,
  SectionFixSchema,
  TasteSchema,
  RootIssueSchema,
  RoundSchema,
  EditorSchema,
  ReviewCardSchema,
  MOVES,
  type Brief,
  type Deliverable,
  type DeliverableKind,
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
  METHODS,
  DELIVERABLE_KINDS
} from '../../shared/schemas'
import {
  DEPTH_EFFORT,
  type Depth,
  type NodeStatus,
  type PacketKind,
  type PipelineEvent,
  ROUND_ANSWERS,
  type RoleDef,
  type RoundAnswerKind,
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
import { collectStrings, lintVoice } from './voice'
import * as P from './prompts'

const MAX_TASKS = 6

/** 결과물 유형별 제작 방식 */
const PRODUCTION: Record<DeliverableKind, { mode: 'diverge' | 'document'; copy: boolean }> = {
  copy: { mode: 'diverge', copy: true },
  content: { mode: 'document', copy: true },
  proposal: { mode: 'document', copy: false },
  strategy: { mode: 'document', copy: false },
  plan: { mode: 'document', copy: false },
  analysis: { mode: 'document', copy: false },
  spec: { mode: 'document', copy: false }
}
/** 프로세스 설계에 회차 판단이 없을 때(이전 기록) 기본으로 회차를 도는 결과물 */
const ROUNDS_DEFAULT = new Set<DeliverableKind>(['copy', 'content', 'proposal', 'spec'])
/** 발산형 결과물의 후보 수 */
const CANDIDATES: Record<Depth, number> = { quick: 18, standard: 30, deep: 42 }

export interface StartArgs {
  /** 없으면 데모 엔진으로 실행 */
  apiKey: string | null
  settings: Settings
  brief: string
  depth: Depth
  /** 첨부 파일 경로 (최대 5개) */
  attachments?: string[]
  /** 요즘 MIN이 꽂힌 것 (선택) */
  now?: string
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
    minNow: args.now,
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
  let rootText = ''
  const system = (role: string) => [
    brainBlock,
    ...(materialBlock ? [materialBlock] : []),
    { type: 'text' as const, text: [memory, rootText, role, lang].filter(Boolean).join('\n\n') }
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
    if (run.minNow) log('inbox', `요즘 MIN이 꽂힌 것: ${run.minNow} — 콘셉트 회차의 재료로 씁니다`)

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
            rounds: { run: true, reason: '설정: 항상 전체 공정' },
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
      `공정 설계(${proc.scale}): 담당 ${proc.maxTasks}명 · Factbook ${proc.factbook.mode} · 방법론 ${proc.methods.length ? proc.methods.join('/') : '없음'} · 시뮬레이션 ${proc.simulate.run ? 'O' : 'X'} · 고도화 ${proc.refine.run ? 'O' : 'X'} · 콘셉트 회차 ${proc.rounds?.run ? 'O' : 'X'} — ${proc.rationale}`
    )
    /* ---- 1.7 근본 이슈: 모든 중간 결과를 대입할 자리 (doctrine §0.12) ---- */
    node('intake', 'running', '근본 이슈 세우는 중')
    const root = await engine.structured({
      model: models.mpm,
      system: system(P.ROLE.root),
      user: P.rootUser(args.brief, canvas, run.answers),
      effort: effort.mpm,
      signal,
      schema: RootIssueSchema,
      validate: (r) => (r.candidates.length < 2 ? '근본 이슈 후보를 2개 이상 써라.' : null)
    })
    const pick = root.candidates[Math.min(Math.max(0, root.recommended), root.candidates.length - 1)]
    run.rootIssue = { issue: pick.issue, test: pick.test, task: root.task, purpose: root.purpose, by: 'mpm', candidates: root.candidates }
    if (settings.rootIssueAsk) {
      node('intake', 'waiting', '근본 이슈 확정 대기')
      log('intake', 'MIN에게 근본 이슈 후보를 보여 주고 확정을 기다립니다.', 'warn')
      emit({ type: 'root', runId, root })
      const ans = await waitForAnswer(runId, signal)
      // 답: [이슈, 판정 질문] — 비우면 MPM 추천
      if (ans?.[0]?.trim()) run.rootIssue = { ...run.rootIssue, issue: ans[0].trim(), test: ans[1]?.trim() || run.rootIssue.test, by: 'min' }
    }
    rootText = P.rootBlock(run.rootIssue)
    log('intake', `근본 이슈(${run.rootIssue.by === 'min' ? 'MIN 확정' : 'MPM 추천'}): ${run.rootIssue.issue}`)
    log('intake', `판정 질문: ${run.rootIssue.test}`)
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

    /* ---- 9. 콘셉트 회차: 걸림 → 수 → 대입 → 고르기 → 리뷰 카드 (doctrine §0.12) ---- */
    const roundsOn = proc.rounds?.run ?? ROUNDS_DEFAULT.has(canvas.deliverable.kind)
    const history: NonNullable<RunRecord['concept']>['rounds'] = []
    if (!roundsOn) {
      skip('rounds', proc.rounds?.reason ?? '정답형 결과물')
    } else {
      run.concept = { rounds: history }
      packet('refine', 'rounds', 'final')
      const maxRounds = Math.max(1, Math.min(5, settings.maxRounds))
      let steer: string | undefined
      let lastMove: string | undefined
      let unchanged = 0
      for (let n = 1; n <= maxRounds; n++) {
        try {
          node('rounds', 'running', `${n}회차 · 걸림 찾는 중`)
          const round = await engine.structured({
            model: models.mpm,
            system: system(P.ROLE.concept),
            user: P.conceptUser(result, { n, history, insight, factbook: run.factbook, now: run.minNow, banMove: lastMove ? MOVES[lastMove as keyof typeof MOVES] : undefined, steer }),
            effort: effort.mpm,
            signal,
            maxTokens: 24000,
            schema: RoundSchema,
            validate: (r) => {
              if (!r.moves.length) return '걸림에 맞는 수를 1~2개 두어라.'
              if (lastMove && r.moves[0].move === lastMove) return `지난 회차의 주된 수(${MOVES[lastMove as keyof typeof MOVES]})를 연속으로 두지 마라. 다른 수를 주된 수로 써라.`
              if (new Set(r.questions.map((q) => q.type)).size < Math.min(3, r.questions.length) || r.questions.length < 2) return '찌르는 질문 후보를 서로 다른 방식으로 3개 써라.'
              return null
            }
          })
          lastMove = round.moves[0].move
          log('rounds', `${n}회차 걸림: ${round.snag}`)
          log('rounds', `수: ${round.moves.map((m) => `${MOVES[m.move]} — ${m.result}${m.keep ? '' : ' (대입 실패 · 버림)'}`).join(' / ')}`)

          // 편집장: MPM 클론
          packet('rounds', 'clone', 'final')
          node('rounds', 'running', `${n}회차 · 편집장 검토`)
          node('clone', 'running', `${n}회차 편집`)
          const editor = await engine.structured({
            model: models.mpm,
            system: system(P.ROLE.editor),
            user: P.editorUser(round, history),
            effort: effort.audit,
            signal,
            schema: EditorSchema,
            validate: (e) => (e.pickedQuestion < 0 || e.pickedQuestion >= round.questions.length ? 'pickedQuestion이 질문 번호와 맞지 않는다.' : null)
          })
          for (const i of editor.vagueMoves) if (round.moves[i]) round.moves[i].keep = false
          let card = editor.card
          try {
            card = await engine.structured({ model: models.light, system: system(P.ROLE.cardPolish), user: P.cardPolishUser(card), effort: 'low', signal, schema: ReviewCardSchema })
          } catch (err) {
            if (signal.aborted) throw err
          }
          const entry: (typeof history)[number] = { n, round, editor, card }
          history.push(entry)
          run.concept.final = { idea: round.best.idea, why: round.best.why }
          node('clone', 'done', `${n}회차 편집`)
          persist()

          // 멈춤 판단: 최선이 그대로인 회차가 연속되면 여지가 줄었다
          const prev = history[history.length - 2]
          unchanged = prev && prev.round.best.idea.trim() === round.best.idea.trim() ? unchanged + 1 : 0
          const last = n === maxRounds
          const editorStop = editor.stop && n >= 2

          // 리뷰 카드: MIN이 한마디로 방향을 튼다
          let kind: RoundAnswerKind = 'auto'
          let text: string | undefined
          if (settings.roundReview === 'wait') {
            node('rounds', 'waiting', `${n}회차 리뷰 카드`)
            emit({ type: 'card', runId, round: n, maxRounds, card, stopHint: editorStop || unchanged >= 1 ? editor.stopWhy || '두 회차 연속 최선이 그대로입니다' : undefined, last })
            const ans = await waitForAnswer(runId, signal)
            kind = (ans?.[0] as RoundAnswerKind) || 'auto'
            text = ans?.[1]?.trim() || undefined
          }
          entry.answer = { kind, text }
          log('rounds', `${n}회차 MIN의 답: ${ROUND_ANSWERS[kind as Exclude<RoundAnswerKind, 'auto'>] ?? '자동 진행'}${text ? ` — ${text}` : ''}`, kind === 'auto' ? 'info' : 'warn')
          persist()

          if (kind === 'stop') {
            run.concept.stoppedBy = `MIN이 ${n}회차 안으로 가자고 했다`
            break
          }
          if (last || (kind === 'auto' && (editorStop || unchanged >= 1))) {
            run.concept.stoppedBy = last ? `회차 상한(${maxRounds})` : editorStop ? `편집장: ${editor.stopWhy}` : '두 회차 연속 최선이 그대로'
            break
          }
          const q = round.questions[editor.pickedQuestion]
          steer =
            kind === 'go'
              ? `MIN이 이 질문으로 가자고 했다: "${q.question}" → ${MOVES[q.leadsTo]}로 이어 간다.${text ? ` MIN의 말: ${text}` : ''}`
              : kind === 'half'
                ? `MIN이 이 질문을 반만 받아들였다: "${q.question}". 얻는 것(${q.gain})은 취하고 잃는 것(${q.loss})은 피하는 쪽으로.${text ? ` MIN의 말: ${text}` : ''}`
                : kind === 'no'
                  ? `MIN이 이 질문을 거절하고 다른 방향을 줬다: ${text ?? '(방향 미기재 — 질문이 공격한 전제는 유지한다)'}`
                  : `MIN의 답이 없어 편집장의 방향으로 자동 진행했다(이 사실을 지금 안의 from에 적는다): ${MOVES[editor.next.move]} — ${editor.next.direction}`
      
        } catch (err) {
          if (signal.aborted) throw err
          // 회차 하나가 실패해도 공정은 멈추지 않는다: 지금까지의 최선으로 브리프를 쓴다
          log('rounds', `${n}회차 실패 — ${history.length ? '지금까지의 최선으로' : '전략의 추천 방향으로'} 진행: ${(err as Error).message}`, 'warn')
          run.concept.stoppedBy = `${n}회차 오류`
          break
        }
      }
      log('rounds', `콘셉트 확정: ${run.concept.final?.idea} (${run.concept.stoppedBy})`)
      node('rounds', 'done', `${history.length}회차 · ${run.concept.stoppedBy?.slice(0, 18) ?? ''}`)
      persist()
    }

    /* ---- 10. BRIEF: 회차의 최선을 결과물로 옮기는 1장 (doctrine §0.11) ---- */
    packet(roundsOn ? 'rounds' : 'refine', 'brief', 'final')
    node('brief', 'running', '1장 브리프 작성 중')
    const writeBrief = (previous?: Brief, directive?: string) =>
      engine.structured({
        model: models.mpm,
        system: system(P.ROLE.brief),
        user: P.briefUser(canvas, result, { insight, factbook: run.factbook, simulation, qa: run.answers, previous, directive, concept: run.concept ? { history: run.concept.rounds, final: run.concept.final } : undefined }),
        effort: effort.mpm === 'low' ? 'medium' : 'max',
        signal,
        maxTokens: 32000,
        schema: BriefSchema,
        validate: (b) =>
          b.angles.length < 3
            ? '서로 다른 탐색 각도(angles)를 3개 이상 써라.'
            : b.kind !== 'copy' && b.outline.length < 2
              ? '문서형 결과물이다. 제목 흐름(outline)을 2개 이상 써라.'
              : null
      })
    let brief = await writeBrief()
    run.workBrief = brief
    log('brief', `제안 한 줄: ${brief.proposition}`)
    log('brief', `도약: ${brief.leap}`)
    persist()
    node('brief', 'done', DELIVERABLE_KINDS[brief.kind])

    // 회차를 돌지 않았으면: 클론이 브리프를 심사하고 MIN이 승인한다 (회차를 돌았으면 리뷰 카드가 이 역할을 했다)
    if (!roundsOn) {
      packet('brief', 'clone', 'final')
      node('clone', 'running', '브리프 심사 — 숲을 보는 중')
      const briefReview = await engine.structured({
        model: models.mpm,
        system: system(P.ROLE.briefReview),
        user: P.briefReviewUser(canvas, brief),
        effort: effort.mpm,
        signal,
        schema: BriefReviewSchema
      })
      run.briefReview = briefReview
      log('clone', `MPM 클론: ${briefReview.insight} (도약 ${briefReview.leapScore}/5${briefReview.generic ? ' · 뻔함' : ''}${briefReview.scopeMatch ? '' : ' · 요청과 다른 결과물'})`)
      if (briefReview.verdict === 'rewrite' && briefReview.directive.trim()) {
        node('clone', 'running', '직권 지시!')
        packet('clone', 'brief', 'directive')
        log('clone', `직권 지시: ${briefReview.directive}`, 'warn')
        brief = await writeBrief(brief, `MPM 클론의 직권 지시 (최우선): ${briefReview.directive}`)
        run.workBrief = brief
        log('brief', `다시 쓴 제안 한 줄: ${brief.proposition}`)
      }
      node('clone', 'done', briefReview.verdict === 'rewrite' ? '직권 지시 반영' : '브리프 통과')
      persist()

      if (settings.briefApproval) {
        node('brief', 'waiting', 'MIN의 브리프 승인 대기')
        log('brief', 'MIN에게 브리프를 보여 주고 승인을 기다립니다.', 'warn')
        emit({ type: 'brief', runId, brief })
        const ans = await waitForAnswer(runId, signal)
        const note = ans?.[0]?.trim()
        if (note) {
          run.briefNote = note
          node('brief', 'running', 'MIN의 지시로 브리프 수정 중')
          brief = await writeBrief(brief, `MIN의 지시 (최우선): ${note}`)
          run.workBrief = brief
          log('brief', `MIN의 지시 반영: ${brief.proposition}`)
        } else log('brief', 'MIN이 브리프를 승인했습니다.')
        node('brief', 'done', DELIVERABLE_KINDS[brief.kind])
        persist()
      }
    }

    /* ---- 10. PRODUCE: 결과물 유형별 제작 → 취향 심사 ---- */
    const prof = PRODUCTION[brief.kind]
    const production: NonNullable<RunRecord['production']> = {}
    run.production = production
    let deliverable: Deliverable
    packet('brief', 'produce', 'final')
    if (prof.mode === 'diverge') {
      const angles = brief.angles.slice(0, 6)
      const total = CANDIDATES[args.depth]
      const per = Math.max(3, Math.ceil(total / angles.length))
      node('produce', 'running', `후보 발산 · 각도 ${angles.length}개 × ${per}`)
      const all: NonNullable<typeof production.candidates> = []
      await pool(angles, settings.maxParallel, async (angle) => {
        try {
          const r = await engine.structured({
            model: models.worker,
            system: system(P.ROLE.diverge),
            user: P.divergeUser(brief, angle, per),
            effort: 'high',
            signal,
            maxTokens: 16000,
            schema: CandidatesSchema
          })
          all.push(...r.candidates.map((c) => ({ ...c, angle: angle.name })))
          log('produce', `각도 "${angle.name}": 후보 ${r.candidates.length}개`)
        } catch (err) {
          if (signal.aborted) throw err
          log('produce', `각도 "${angle.name}" 실패: ${(err as Error).message}`, 'warn')
        }
      })
      if (!all.length) throw new Error('후보를 하나도 만들지 못했습니다')
      production.candidates = all
      node('produce', 'done', `후보 ${all.length}개`)
      persist()

      packet('produce', 'taste', 'final')
      node('taste', 'running', `후보 ${all.length}개 심사`)
      const taste = await engine.structured({
        model: models.mpm,
        system: system(P.ROLE.taste),
        user: P.tasteUser(brief, all),
        effort: effort.audit,
        signal,
        maxTokens: 32000,
        schema: TasteSchema,
        validate: (t) => (!t.picks.length ? '살릴 후보를 골라라.' : t.picks.some((x) => !all[x.id]) ? 'picks의 id가 후보 번호(#)와 맞지 않는다.' : null)
      })
      production.taste = taste
      log('taste', `${all.length}개 중 ${taste.picks.length}개를 살림. 버린 이유: ${taste.killedPatterns.slice(0, 3).join(' / ')}`)
      persist()
      node('taste', 'running', '살린 후보 다듬는 중')
      const picks = [
        ...taste.picks.map((x) => `#${x.id} [${all[x.id].angle}] ${all[x.id].head}${all[x.id].body ? ` / ${all[x.id].body}` : ''} — 고른 이유: ${x.why}`),
        ...taste.rescue.filter((x) => all[x.id]).map((x) => `#${x.id} [살릴 조각] ${all[x.id].head} — 살리는 법: ${x.how}`)
      ].join('\n')
      deliverable = await engine.structured({
        model: models.mpm,
        system: system(P.ROLE.produce(true)),
        user: P.produceUser(brief, result, { picks, sharpen: taste.sharpen, factbook: run.factbook }),
        effort: effort.mpm,
        signal,
        maxTokens: 32000,
        schema: DeliverableSchema
      })
      node('taste', 'done', `${all.length}개 중 ${taste.picks.length}개 채택`)
    } else {
      node('produce', 'running', `${DELIVERABLE_KINDS[brief.kind]} 작성 중`)
      deliverable = await engine.structured({
        model: models.mpm,
        system: system(P.ROLE.produce(prof.copy)),
        user: P.produceUser(brief, result, { factbook: run.factbook }),
        effort: effort.mpm,
        signal,
        maxTokens: 64000,
        schema: DeliverableSchema
      })
      node('produce', 'done', `${deliverable.sections.length}개 절`)
      persist()

      packet('produce', 'taste', 'final')
      node('taste', 'running', '결과물 심사 중')
      const docTaste = await engine.structured({
        model: models.mpm,
        system: system(P.ROLE.docTaste),
        user: P.docTasteUser(brief, deliverable),
        effort: effort.audit,
        signal,
        schema: DocTasteSchema
      })
      production.docTaste = docTaste
      log('taste', `결과물 심사: 제목 흐름 ${docTaste.flowReads ? '통과' : '끊김'} · 도약 ${docTaste.leapScore}/5 · 고칠 절 ${docTaste.issues.length}개`)
      if (docTaste.verdict === 'fix' && docTaste.issues.length) {
        // 지적받은 절만 고친다 (전체를 다시 쓰면 평균으로 돌아간다)
        node('taste', 'running', `${docTaste.issues.length}개 절 고치는 중`)
        const fix = await engine.structured({
          model: models.mpm,
          system: system(P.ROLE.sectionFix(prof.copy)),
          user: P.sectionFixUser(brief, deliverable, docTaste.issues),
          effort: effort.mpm,
          signal,
          maxTokens: 32000,
          schema: SectionFixSchema
        })
        const sections = [...deliverable.sections]
        for (const f of fix.sections) {
          const i = sections.findIndex((x) => x.heading.trim() === f.originalHeading.trim())
          if (i >= 0) sections[i] = { heading: f.heading, body: f.body }
        }
        deliverable = { ...deliverable, sections }
        production.fixed = fix.sections.map((f) => f.heading)
      }
      node('taste', 'done', docTaste.verdict === 'fix' ? `${production.fixed?.length ?? 0}개 절 수정` : '통과')
    }
    run.deliverable = deliverable
    persist()

    /* ---- 11. DELIVER: 윤문 후 납품 ---- */
    packet('taste', 'deliver', 'final')
    node('deliver', 'running', '윤문 — MIN의 문장으로')
    const before = lintVoice(collectStrings(deliverable))
    if (before.perThousand < 0.3) {
      log('deliver', `윤문: AI투 표현 ${before.total}개 — 고칠 만큼 많지 않아 건너뜀`)
      verification.polish = { before: before.total, after: before.total, top: before.hits.slice(0, 8) }
    } else {
      try {
        const polished = await engine.structured({
          model: models.worker,
          system: system(P.ROLE.polish),
          user: P.polishUser(deliverable, before.hits),
          effort: 'medium',
          signal,
          maxTokens: 32000,
          schema: DeliverableSchema,
          validate: (v) => (v.sections.length !== deliverable.sections.length ? `절의 수를 바꾸지 마라 (원래 ${deliverable.sections.length}개)` : null)
        })
        const after = lintVoice(collectStrings(polished))
        verification.polish = { before: before.total, after: after.total, top: before.hits.slice(0, 8) }
        if (after.total <= before.total) {
          run.deliverable = polished
          persist()
        }
        log('deliver', `윤문: AI투 표현 ${before.total}개 → ${after.total}개${before.hits.length ? ` (많았던 것: ${before.hits.slice(0, 5).map((h) => h.phrase).join(', ')})` : ''}`)
      } catch (err) {
        if (signal.aborted) throw err
        log('deliver', `윤문 실패 — 원문으로 납품: ${(err as Error).message}`, 'warn')
      }
    }
    node('deliver', 'done', run.deliverable?.title ?? '최종')
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
