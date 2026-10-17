/**
 * 공정 시각화 상태. 메인 프로세스의 PipelineEvent를 누적하거나,
 * 저장된 RunRecord로부터 완료 상태를 복원한다.
 */
import type { Brief, ChallengeQuestion, TaskSpec } from '@shared/schemas'
import type { NodeStatus, PacketKind, PipelineEvent, RunRecord, UsageSummary } from '@shared/types'

export interface Packet {
  id: number
  from: string
  to: string
  kind: PacketKind
  born: number
}

export interface LiveState {
  runId: string | null
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  nodes: Record<string, { status: NodeStatus; detail?: string }>
  tasks: TaskSpec[]
  packets: Packet[]
  usage: UsageSummary
  record: RunRecord | null
  /** MPM이 MIN의 답을 기다리는 질문 */
  questions: { reading: string; items: ChallengeQuestion[] } | null
  /** MIN의 승인을 기다리는 1장 브리프 */
  brief: Brief | null
  error?: string
}

export const EMPTY: LiveState = {
  runId: null,
  status: 'idle',
  nodes: {},
  tasks: [],
  packets: [],
  usage: {},
  record: null,
  questions: null,
  brief: null
}

let packetSeq = 0
export const PACKET_MS = 1400

export function reduce(state: LiveState, e: PipelineEvent): LiveState {
  if (state.runId && e.runId !== state.runId) return state
  switch (e.type) {
    case 'run':
      if (e.status === 'started') return { ...EMPTY, runId: e.runId, status: 'running' }
      return { ...state, status: e.status, error: e.error, questions: null, brief: null }
    case 'brief':
      return { ...state, brief: e.brief }
    case 'questions':
      return { ...state, questions: { reading: e.reading, items: e.questions } }
    case 'node':
      if (state.questions && e.status !== 'waiting' && (e.nodeId === 'intake' || e.nodeId === 'audit')) state = { ...state, questions: null }
      if (state.brief && e.nodeId === 'brief' && e.status !== 'waiting') state = { ...state, brief: null }
      return { ...state, nodes: { ...state.nodes, [e.nodeId]: { status: e.status, detail: e.detail } } }
    case 'workers': {
      const nodes = { ...state.nodes }
      for (const t of e.tasks) nodes[`worker:${t.id}`] = { status: 'queued', detail: '대기' }
      return { ...state, tasks: e.tasks, nodes }
    }
    case 'packet': {
      const now = performance.now()
      const alive = state.packets.filter((p) => now - p.born < PACKET_MS)
      return { ...state, packets: [...alive, { id: ++packetSeq, from: e.from, to: e.to, kind: e.kind, born: now }] }
    }
    case 'usage':
      return { ...state, usage: e.usage }
    case 'record':
      return { ...state, record: e.record }
    default:
      return state
  }
}

/** 저장된 기록을 정적인 완료 공정으로 복원 */
export function fromRecord(r: RunRecord): LiveState {
  const done = (detail?: string) => ({ status: 'done' as NodeStatus, detail })
  const nodes: LiveState['nodes'] = {}
  nodes.inbox = done('업무 접수')
  if (r.canvas) nodes.intake = done(r.canvas.title)
  if (r.plan) nodes.dispatch = done(`${r.plan.tasks.length}개 업무 분장`)
  for (const t of Object.values(r.tasks)) {
    const last = t.rounds[t.rounds.length - 1]
    nodes[`worker:${t.task.id}`] = {
      status: t.status === 'done' ? 'done' : t.rounds.length ? 'done' : 'idle',
      detail: last?.audit ? `신뢰도 ${last.audit.trustScore} · ${t.rounds.length}라운드` : undefined
    }
  }
  if (Object.values(r.tasks).some((t) => t.rounds.some((x) => x.audit))) nodes.audit = done('검수 완료')
  if (r.factbook) nodes.factbook = done(`사실 ${r.factbook.facts.length}건`)
  if (r.simulation) nodes.simulate = done(`페르소나 ${r.simulation.personas.length}`)
  if (r.insight) nodes.insight = done('4-3-2 확정')
  const v = r.verification
  if (r.synthesis) nodes.synthesize = done(`대안 ${r.synthesis.alternatives.length}개`)
  if (v?.review) nodes.review = done(v.review.verdict === 'improve' ? `개선 ${v.review.issues.length}건` : '유지')
  if (v?.refine) nodes.refine = done(v.refine.verdict === 'improve' ? `고도화 ${v.refine.issues.length}건` : '유지')
  if (v?.clone) nodes.clone = done(v.clone.bigIssue ? '직권 지시 반영' : '통합 검증 통과')
  if (r.workBrief) nodes.brief = done(r.workBrief.proposition.slice(0, 24))
  if (r.briefReview) nodes.clone = done(r.briefReview.verdict === 'rewrite' ? '직권 지시 반영' : '브리프 통과')
  const pd = r.production
  if (pd?.candidates) nodes.produce = done(`후보 ${pd.candidates.length}개`)
  else if (r.deliverable) nodes.produce = done(`${r.deliverable.sections.length}개 절`)
  if (pd?.taste) nodes.taste = done(`${pd.candidates?.length ?? 0}개 중 ${pd.taste.picks.length}개 채택`)
  else if (pd?.docTaste) nodes.taste = done(pd.docTaste.verdict === 'fix' ? `${pd.fixed?.length ?? 0}개 절 수정` : '통과')
  if (r.status === 'done') nodes.deliver = done(r.deliverable?.title ?? `최종 · ${v?.versions.length ?? 1}번 다듬음`)
  // MPM이 공정 설계에서 생략한 단계
  const pr = r.canvas?.process
  if (pr) {
    const sk = (id: string, reason: string) => (nodes[id] = { status: 'skipped', detail: `생략 · ${reason}` })
    if (pr.factbook.mode === 'skip') sk('factbook', pr.factbook.reason)
    if (!pr.simulate.run) sk('simulate', pr.simulate.reason)
    if (!pr.methods.length) sk('insight', pr.methodsReason)
    if (!pr.refine.run) sk('refine', pr.refine.reason)
    if (!pr.clone.run && !r.briefReview) sk('clone', pr.clone.reason)
  }
  if (r.status === 'error') {
    const failing = !r.canvas ? 'intake' : !r.plan ? 'dispatch' : !r.simulation ? 'audit' : !r.insight ? 'insight' : !r.synthesis ? 'synthesize' : !v?.review ? 'review' : !r.workBrief ? 'brief' : !r.briefReview ? 'clone' : !r.deliverable ? 'produce' : 'deliver'
    nodes[failing] = { status: 'error', detail: '오류' }
  }
  return {
    runId: r.id,
    status: r.status === 'running' ? 'error' : r.status,
    nodes,
    tasks: r.plan?.tasks ?? [],
    packets: [],
    usage: r.usage,
    record: r,
    questions: null,
    brief: null,
    error: r.error
  }
}
