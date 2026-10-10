import type {
  AuditResult,
  ChallengeQuestion,
  CloneReview,
  Factbook,
  Insight,
  Review,
  ContextCanvas,
  DispatchPlan,
  Simulation,
  Synthesis,
  TaskSpec,
  WorkerReport
} from './schemas'

export type Depth = 'quick' | 'standard' | 'deep'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ModelTiers {
  mpm: string
  worker: string
  light: string
}

export interface Settings {
  models: ModelTiers
  depth: Depth
  maxRework: number
  maxParallel: number
  /** Factbook 조사에 실제 웹 검색 사용 */
  webResearch: boolean
  /** adaptive: MPM이 과제마다 공정 규모를 설계 / full: 항상 전체 공정 */
  processMode: 'adaptive' | 'full'
  /** MPM이 설정값을 무시하고 업무별 모델을 직접 고를 권한 */
  delegation: boolean
  /** 질문 게이트: critical=판단이 크게 바뀔 때만, always=질문이 있으면 항상, never=가정으로 진행 */
  askMode: 'critical' | 'always' | 'never'
  language: 'ko' | 'en'
  /**
   * 비용 예산. Claude API는 선불 잔액을 조회하는 API가 없으므로 잔여 = 예산 − 소진으로 계산한다.
   * monthly: 매월 1일 리셋되는 월 예산 / credit: since 시점에 충전·확인한 잔액
   */
  budget: { mode: 'monthly' | 'credit'; amount: number; since: string }
  /** 원격 MCP 서버 — Factbook 조사에서 하위 담당이 도구로 사용. 토큰은 secrets에 `mcp:<name>`으로 암호화 저장 */
  mcpServers: { name: string; url: string; enabled: boolean }[]
  /** 통합(연동)별 설정값. 키: integration id */
  integrations: Record<string, Record<string, string>>
}

export const DEFAULT_SETTINGS: Settings = {
  models: { mpm: 'claude-opus-5-5', worker: 'claude-sonnet-5-5', light: 'claude-haiku-5-5' },
  depth: 'standard',
  maxRework: 1,
  maxParallel: 4,
  webResearch: true,
  delegation: true,
  processMode: 'adaptive',
  askMode: 'critical',
  language: 'ko',
  budget: { mode: 'monthly', amount: 0, since: '' },
  mcpServers: [],
  integrations: {}
}

export const DEPTH_EFFORT: Record<Depth, { mpm: Effort; worker: Effort; audit: Effort }> = {
  quick: { mpm: 'medium', worker: 'low', audit: 'medium' },
  standard: { mpm: 'high', worker: 'medium', audit: 'high' },
  deep: { mpm: 'xhigh', worker: 'high', audit: 'high' }
}

/** USD per 1M tokens (input, output, cache read). 견적 표시용. */
export const PRICING: Record<string, { in: number; out: number; cacheRead: number }> = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01 },
  'claude-fable-5-1': { in: 10, out: 50, cacheRead: 0.25 }
}

export interface ModelUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  calls: number
}
export type UsageSummary = Record<string, ModelUsage>

export function estimateCost(usage: UsageSummary): number {
  let usd = 0
  for (const [model, u] of Object.entries(usage)) {
    const p = PRICING[model]
    if (!p) continue
    usd += (u.input * p.in + u.output * p.out + u.cacheRead * p.cacheRead + u.cacheWrite * p.in * 1.25) / 1e6
  }
  return usd
}

/* ---------- 공정 노드 ---------- */
export type NodeStatus = 'idle' | 'queued' | 'running' | 'waiting' | 'done' | 'rework' | 'error' | 'skipped'
/** 고정 노드 id. 하위 담당은 `worker:<taskId>` */
export type FixedNodeId = 'inbox' | 'intake' | 'dispatch' | 'audit' | 'simulate' | 'synthesize' | 'deliver'
export type PacketKind = 'brief' | 'canvas' | 'task' | 'report' | 'rework' | 'approved' | 'insight' | 'final' | 'fact' | 'revise' | 'directive'

export type PipelineEvent =
  | { type: 'run'; runId: string; status: 'started' | 'done' | 'error' | 'cancelled'; error?: string }
  | { type: 'node'; runId: string; nodeId: string; status: NodeStatus; detail?: string }
  | { type: 'workers'; runId: string; tasks: TaskSpec[] }
  | { type: 'packet'; runId: string; from: string; to: string; kind: PacketKind }
  | { type: 'log'; runId: string; nodeId: string; text: string; level: 'info' | 'warn' | 'error' }
  | { type: 'usage'; runId: string; usage: UsageSummary }
  | { type: 'questions'; runId: string; reading: string; questions: ChallengeQuestion[] }
  | { type: 'record'; runId: string; record: RunRecord }

export interface TaskRun {
  task: TaskSpec
  /** MPM이 위임한 실제 모델 */
  model?: string
  /** 이 담당이 업무와 별개로 만든 Factbook */
  factbook?: Factbook
  rounds: { report: WorkerReport; audit?: AuditResult; research?: string }[]
  status: NodeStatus
}

export interface RunFeedback {
  chosen: string
  note: string
  at: string
}

export interface RunRecord {
  id: string
  createdAt: string
  updatedAt: string
  title: string
  brief: string
  depth: Depth
  status: 'running' | 'done' | 'error' | 'cancelled'
  error?: string
  /** 참고 자료 (첨부 파일·링크) — 원본 내용은 저장하지 않고 목록만 */
  materials?: { source: string; kind: string; note?: string }[]
  materialErrors?: string[]
  /** API 키 없이 데모 엔진으로 실행됨 (비용 집계 제외) */
  demo?: boolean
  brainVersion: string
  canvas?: ContextCanvas
  /** 질문 게이트에서 MIN이 답한 내용. skipped=가정대로 진행 */
  answers?: { question: string; answer: string }[]
  answersSkipped?: boolean
  plan?: DispatchPlan
  tasks: Record<string, TaskRun>
  /** 담당별 Factbook을 통합한 미션 Factbook */
  factbook?: Factbook
  simulation?: Simulation
  /** SUPER INSIGHT: AARRR·TOWS·STP 2.0·CDJ 분석과 MIN'S 4-3-2 THINKING */
  insight?: Insight
  synthesis?: Synthesis
  /** 결과 이후의 검증 이력: 재검증 → 고도화 → MPM 클론 */
  verification?: {
    review?: Review
    refine?: Review
    clone?: CloneReview
    versions: { label: string; at: string }[]
  }
  usage: UsageSummary
  log: { at: string; nodeId: string; text: string; level: 'info' | 'warn' | 'error' }[]
  feedback?: RunFeedback
}

export interface RunSummary {
  id: string
  title: string
  createdAt: string
  status: RunRecord['status']
  costUsd: number
  demo?: boolean
}

/* ---------- 두뇌 ---------- */
export interface RoleDef {
  id: string
  name: string
  icon: string
  tier: 'worker' | 'light'
  research: boolean
  mission: string
  lens: string
}

export interface BrainFile {
  name: string
  source: 'bundled' | 'user'
  content: string
}

export interface BrainMemoryItem {
  runId: string
  title: string
  chosen: string
  note: string
  at: string
}

export interface BrainSnapshot {
  version: string
  doctrine: string
  doctrineOverridden: boolean
  roles: RoleDef[]
  rosterOverridden: boolean
  identity: BrainFile[]
  knowledge: BrainFile[]
  memory: BrainMemoryItem[]
  userDir: string
}

/* ---------- 내보내기 / 연동 ---------- */
export type ExportFormat = 'md' | 'html' | 'json' | 'pdf' | 'factbook' | 'pptx'

export interface IntegrationField {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
}

export interface IntegrationInfo {
  id: string
  name: string
  description: string
  fields: IntegrationField[]
  source: 'builtin' | 'plugin'
}

export interface CostStatus {
  /** 기간 내 소진 비용 (USD) */
  spent: number
  /** 예산 − 소진. 예산 미설정이면 null */
  remaining: number | null
  budget: number
  /** admin: Cost API 실측(조직 전체) / local: 이 앱의 호출 기록 추정 */
  source: 'admin' | 'local'
  periodLabel: string
  updatedAt: string
  error?: string
}

export interface AttachmentInfo {
  path: string
  name: string
  size: number
  ext: string
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error' | 'dev'
  version?: string
  progress?: number
  message?: string
}

/* ---------- preload가 노출하는 API ---------- */
export interface LikeMinApi {
  app: { version(): Promise<string> }
  settings: {
    get(): Promise<{ settings: Settings; hasKey: boolean; keySource: 'stored' | 'env' | 'none' }>
    save(s: Settings): Promise<void>
    setKey(key: string): Promise<{ ok: boolean; message: string }>
    clearKey(): Promise<void>
  }
  files: {
    /** 파일 선택 창 → 경로 목록 */
    pick(): Promise<AttachmentInfo[]>
    /** 드래그&드롭한 파일 → 경로 */
    pathFor(file: File): string
    info(paths: string[]): Promise<AttachmentInfo[]>
  }
  links: {
    login(url: string): Promise<void>
    clearSessions(): Promise<void>
  }
  secrets: {
    has(name: string): Promise<boolean>
    set(name: string, value: string | null): Promise<void>
  }
  cost: {
    get(force?: boolean): Promise<CostStatus>
    setAdminKey(key: string | null): Promise<{ ok: boolean; message: string }>
    hasAdminKey(): Promise<boolean>
  }
  brain: {
    get(): Promise<BrainSnapshot>
    saveDoctrine(text: string | null): Promise<void>
    saveRoster(roles: RoleDef[] | null): Promise<void>
    addKnowledge(name: string, content: string): Promise<void>
    importKnowledge(): Promise<number>
    removeKnowledge(name: string): Promise<void>
    removeMemory(runId: string): Promise<void>
    openFolder(): Promise<void>
  }
  runs: {
    list(): Promise<RunSummary[]>
    get(id: string): Promise<RunRecord | null>
    remove(id: string): Promise<void>
    start(brief: string, depth: Depth, demo?: boolean, attachments?: string[]): Promise<string>
    cancel(id: string): Promise<void>
    /** 질문 게이트 응답. null이면 가정대로 진행 */
    answer(id: string, answers: string[] | null): Promise<void>
    feedback(id: string, chosen: string, note: string): Promise<void>
    onEvent(cb: (e: PipelineEvent) => void): () => void
  }
  exporter: {
    save(id: string, format: ExportFormat): Promise<{ ok: boolean; path?: string }>
    markdown(id: string): Promise<string>
  }
  integrations: {
    list(): Promise<IntegrationInfo[]>
    send(id: string, runId: string): Promise<{ ok: boolean; message: string; url?: string }>
    openPluginFolder(): Promise<void>
  }
  updater: {
    check(): Promise<void>
    install(): Promise<void>
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
}
