/**
 * 데모 엔진: API 키 없이 공정 흐름을 체험하도록 미리 준비된 결과를 시간차를 두고 돌려준다.
 * ClaudeEngine과 같은 인터페이스(structured/research/usage)를 따른다.
 */
import type { z } from 'zod'
import {
  AuditResultSchema,
  ContextCanvasSchema,
  DispatchPlanSchema,
  SimulationSchema,
  SynthesisSchema,
  FactbookSchema,
  ReviewSchema,
  CloneReviewSchema,
  InsightSchema,
  RootIssueSchema,
  RoundSchema,
  EditorSchema,
  ReviewCardSchema,
  type RootIssue,
  type Round,
  type Editor,
  BriefSchema,
  BriefReviewSchema,
  CandidatesSchema,
  TasteSchema,
  DeliverableSchema,
  DocTasteSchema,
  SectionFixSchema,
  type Brief,
  type BriefReview,
  type Deliverable,
  type DocTaste,
  type Taste,
  type Insight,
  type Factbook,
  type Review,
  type CloneReview,
  WorkerReportSchema,
  type AuditResult,
  type ContextCanvas,
  type DispatchPlan,
  type Simulation,
  type Synthesis,
  type WorkerReport
} from '../../shared/schemas'
import type { UsageSummary } from '../../shared/types'
import { PipelineCancelled, type CallOptions } from './claude'

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new PipelineCancelled())
    })
  })

/** 개발용: SWLM_DEMO_FAIL=refine 이면 고도화 단계에서 한 번 한도 오류를 낸다 (이어서 진행 시험) */
let demoFailed = false
export const demoCalls: Record<string, number> = {}

/** 데모에서 발산형(카피) 제작을 보려면 SWLM_DEMO_KIND=copy */
const COPY_MODE = process.env.SWLM_DEMO_KIND === 'copy'

const canvas: ContextCanvas = {
  title: '구독형 밀키트 초기 고객 확보',
  deliverable: COPY_MODE
    ? { kind: 'copy', output: '런칭 캠페인 헤드라인과 보조 문구', notThis: '채널 운영 계획이나 측정 설계는 결과물이 아니다' }
    : { kind: 'plan', output: '런칭 첫 90일 고객 확보 실행 계획서', notThis: '검증 지표 설계는 계획서의 한 절이지 계획서 자체가 아니다' },
  reframe: {
    surfaceRequest: '3개월 내 런칭할 30대 직장인 대상 구독 밀키트의 초기 고객 확보 전략',
    realProblem: '30대 직장인이 “구독”이라는 약속을 할 만큼 저녁 식사 문제를 반복적으로 느끼는지, 그리고 기존 대안(배달·편의점·마트 밀키트) 대비 바꿀 이유가 있는지 검증하는 것',
    questionedPremises: ['30대 직장인이 하나의 타깃이라는 전제', '구독 모델이 단건 구매보다 낫다는 전제', '초기 고객 확보 = 광고 집행이라는 전제']
  },
  goal: '런칭 후 90일 내 유료 구독 500명, 2회차 유지율 60%',
  purpose: '구독을 지속시키는 핵심 가치(시간 절약 vs 건강 vs 메뉴 고민 해소)가 무엇인지 확인해 다음 단계 투자 판단 근거를 만든다',
  core: {
    brand: '아직 브랜드 자산이 없음 — 첫 경험이 곧 브랜드 약속이 된다',
    consumer: '퇴근 후 결정 피로가 큰 1~2인 가구 직장인, 건강과 절약 사이의 죄책감',
    market: '밀키트 시장은 성숙기, 대형 유통사 PB와 가격 경쟁 중. 구독 피로도 증가'
  },
  timeHorizon: { now: '런칭 전 12주 검증', next: '6개월 내 리텐션 구조 확보', long: '카테고리 내 “결정 대행” 포지션' },
  stakeholders: [
    { who: '창업팀', gains: '투자 판단 근거', loses: '마케팅 예산', unknowns: '실제 CAC' },
    { who: '타깃 고객', gains: '저녁 결정 피로 감소', loses: '구독 해지 번거로움', unknowns: '주당 실제 조리 횟수' }
  ],
  criteria: [
    { criterion: '2회차 유지율(목적 검증력)', priority: 1 },
    { criterion: '브랜드 첫 경험 일관성', priority: 2 },
    { criterion: 'CAC 대비 LTV 가능성', priority: 3 }
  ],
  boundaries: {
    fixed: ['런칭 일정 3개월', '초기 마케팅 예산 제한'],
    mustNotAssume: ['30대 직장인이 주 3회 이상 요리한다', '할인이 리텐션을 만든다'],
    undecided: ['가격대', '배송 권역']
  },
  assumptions: [
    { statement: '타깃의 주 2회 이상 집밥 의향', risk: 'high', howToVerify: '사전 예약 랜딩 + 설문 200명' },
    { statement: '메뉴 고민이 핵심 페인', risk: 'medium', howToVerify: '인터뷰 15명' }
  ],
  why: {
    influencePath: '첫 박스 경험 → 동료·가족에게 “저녁 고민이 사라졌다”는 이야기 → 사내·지인 추천으로 확산',
    warning: ''
  },
  cost: { known: '확인 필요 (초기 마케팅 예산 규모 미제시)', toVerify: ['초기 마케팅 예산', '박스당 원가·배송 단가'] },
  competition: {
    landscape: '대형 유통 PB 밀키트(가격), 배달앱(즉시성), 편의점 도시락(접근성)과 경쟁',
    meaningfulDifference: '가격·메뉴 수가 아니라 “결정을 대신해 주는 신뢰” — 메뉴를 더 늘리는 차별은 차별을 위한 차별'
  },
  clarifyingQuestions: ['배송 권역은 수도권 한정인가?', '목표 객단가는 어느 수준인가?'],
  materials: [],
  initialClaims: ['밀키트가 아니라 “저녁 결정”을 판다', '확산은 광고보다 관계에서 일어난다'],
  process: {
    scale: 'standard',
    rationale: '런칭 전략이라 시장·경쟁 사실과 수익성 검토가 결과를 바꾼다. 다만 고객 여정은 AARRR와 겹쳐 CDJ는 생략',
    givenContext: '',
    maxTasks: 5,
    factbook: { mode: 'light', reason: '시장·경쟁 사실은 필요하지만 모든 담당이 조사할 필요는 없음 — 시장 담당만' },
    simulate: { run: true, reason: '구독 해지 같은 엣지 행동이 결과를 좌우' },
    methods: ['aarrr', 'tows', 'stp', 'jtbd', 'unit', 'competition'],
    methodsReason: '퍼널·포지셔닝·고객의 일·수익성·경쟁이 모두 판단 축. CDJ는 AARRR와 중복이라 제외',
    refine: { run: true, reason: '비용·지표 디테일이 실행 판단에 직결' },
    rounds: { run: true, reason: '첫 고객을 어디서 데려올지는 분석보다 생각의 도약이 가른다' },
    clone: { run: true, reason: '런칭 방향 자체를 거시적으로 점검할 가치가 있음' }
  },
  intent: {
    reading: '30대 직장인 첫 구독 고객을 어떻게 모을지 실행안이 필요하다',
    clear: false,
    questions: [
      {
        question: '이번 일은 “밀키트를 파는 것”이 목표인가요, “구독이라는 관계를 만드는 것”이 목표인가요?',
        analogy: '식당으로 치면, 오늘 손님 100명을 받는 게 중요한가요, 매주 오는 단골 30명을 만드는 게 중요한가요?',
        why: '단건 판매면 프로모션 중심, 관계면 첫 경험·반복 경험 설계 중심으로 전략이 완전히 갈립니다',
        checkpoint: 'why',
        ifUnanswered: '단골(구독 관계)을 만드는 것이 목표라고 가정'
      }
    ]
  },
  judgment: {
    decision: '표면 요청(고객 확보)보다 “반복 페인 검증”을 실제 문제로 재정의한다',
    basis: [
      { principle: '먼저 허물고 다시 세운다', source: 'doctrine §3', application: '“초기 고객 확보 = 광고 집행” 전제를 의심' },
      { principle: '목표와 목적 분리, 충돌 시 목적 우선', source: 'doctrine §2', application: '구독 500명(목표) < 지속 가치 검증(목적)' },
      { principle: '문제를 답보다 먼저 다룬다', source: '02-min-skill.md §3.1', application: '전략보다 성공 조건부터 정의' }
    ],
    counterCheck: '시장 검증이 이미 끝난 상태라면 실행 전략 중심이 맞다 — 브리프에 그런 근거가 없어 재정의를 유지',
    confidence: 'medium'
  }
}

const plan: DispatchPlan = {
  rationale: '소비자 페인 검증을 최우선으로, 시장 포지션·브랜드 첫 경험·실행 채널을 병렬로 보고, 반론 담당이 “구독” 자체를 공격하게 했다.',
  judgment: {
    decision: '페인 검증과 반론은 최상위 모델에, 나머지는 작업 모델에 위임한다',
    basis: [{ principle: '위임 권한 — 판단 난이도로 모델 선택', source: 'doctrine §0.8', application: '결정을 바꿀 수 있는 두 업무에 판단력 집중' }],
    counterCheck: '비용이 늘지만, 이 두 업무가 틀리면 전체가 틀린다',
    confidence: 'high'
  },
  tasks: [
    { id: 't1', roleId: 'consumer', title: '타깃 맥락·페인 분해', contract: { objective: '구독할 만큼 반복되는 페인인지 판단', responsibility: '평균이 아닌 상황별 타깃 분해', criteria: '반복성·강도·대안 존재', boundaries: '수요 규모 추정 금지', deliverable: '세그먼트별 페인·근거·확신도' }, focusQuestions: ['왜 배달이 아니라 밀키트인가?'], tier: 'mpm', tierReason: '전체 판단의 전제가 되는 페인 검증이라 최상위 모델에 위임' },
    { id: 't2', roleId: 'market', title: '경쟁·대체재 구도', contract: { objective: '진입 가능한 빈자리 확인', responsibility: '구조적 변화와 유행 구분', criteria: '지속성', boundaries: '출처 없는 수치는 추정 표시', deliverable: '경쟁 지도와 빈자리' }, focusQuestions: ['PB 밀키트와의 차별점은?'], tier: 'worker', tierReason: '분석·정리 중심 업무' },
    { id: 't3', roleId: 'brand', title: '첫 경험 = 브랜드 약속', contract: { objective: '첫 박스 경험 설계 원칙', responsibility: '장기 신뢰', criteria: '일관성', boundaries: '로고·네이밍 제외', deliverable: '경험 원칙 3~5개' }, focusQuestions: ['첫 박스에서 무엇을 증명해야 하나?'], tier: 'worker', tierReason: '분석·정리 중심 업무' },
    { id: 't4', roleId: 'growth', title: '초기 채널·메시지', contract: { objective: '첫 500명 확보 경로', responsibility: '예산 효율', criteria: 'CAC·검증 속도', boundaries: '대규모 매체 집행 가정 금지', deliverable: '채널 가설과 실험 설계' }, focusQuestions: ['사내 커뮤니티/B2B 경로는?'], tier: 'light', tierReason: '채널 후보 취합 위주의 정리 업무' },
    { id: 't5', roleId: 'devil', title: '구독 모델 반론', contract: { objective: '구독 전제 공격', responsibility: '실패 시나리오', criteria: '결정을 바꿀 수 있는 반론만', boundaries: '반대를 위한 반대 금지', deliverable: '반론과 결정 변경 조건' }, focusQuestions: ['단건 구매가 더 나은 조건은?'], tier: 'mpm', tierReason: '전제를 공격하는 고난도 반론' }
  ]
}

const report = (topic: string, rework = false): WorkerReport => ({
  summary: rework ? `${topic}: 검수 지적을 반영해 근거와 분류를 보강했다.` : `${topic}에 대한 1차 분석.`,
  findings: [
    { claim: `${topic} 관련 핵심 관찰 1`, kind: rework ? 'inference' : 'fact', basis: '인터뷰·공개 자료 기반 추론', source: rework ? '업계 리포트(2025)' : '', confidence: 'medium' },
    { claim: `${topic} 관련 가설`, kind: 'hypothesis', basis: '유사 카테고리 사례', source: '', confidence: 'low' }
  ],
  implications: [{ axis: 'consumer', point: '결정 피로 해소가 시간 절약보다 강한 동기일 수 있음' }],
  proposals: [{ idea: `${topic} 기반 실험`, why: '가장 위험한 가정을 먼저 검증', tradeoff: '속도 vs 표본' }],
  risks: ['표본 편향'],
  unknowns: ['실제 조리 빈도']
})

const audit = (approve: boolean): AuditResult => ({
  verdict: approve ? 'approve' : 'rework',
  trustScore: approve ? 78 : 41,
  issues: approve
    ? [{ target: '가설', problem: '검증 방법이 모호함', type: 'missing', severity: 'low' }]
    : [{ target: '핵심 관찰 1', problem: '출처 없이 사실로 분류됨', type: 'misclassified', severity: 'high' }],
  reworkInstruction: approve ? '' : '출처를 제시하거나 추론으로 재분류하고, 적용 조건을 명시하라.',
  keptInsights: approve ? ['결정 피로 해소가 핵심 동기일 가능성', '첫 박스 경험이 2회차 유지를 좌우'] : []
})

const factbook: Factbook = {
  scope: '국내 밀키트·식품 구독 시장 (데모 데이터 — 실제 실행 시 웹 조사로 채워짐)',
  facts: [
    { statement: '(데모) 국내 밀키트 시장은 대형 유통 PB 비중이 커지고 있다', category: 'market', source: '데모 출처', url: '', date: '2025', reliability: 'medium' },
    { statement: '(데모) 1~2인 가구 비중이 지속 증가 중', category: 'consumer', source: '데모 출처', url: '', date: '2025', reliability: 'high' }
  ],
  datasets: [
    { title: '(데모) 저녁 식사 해결 방식', unit: '%', chart: 'bar', rows: [{ label: '배달', value: 38, note: '' }, { label: '직접 조리', value: 27, note: '' }, { label: '편의점', value: 19, note: '' }, { label: '밀키트', value: 16, note: '' }], source: '데모 설문' }
  ],
  products: [
    {
      name: '(데모) 프레시 밀 박스', brand: '경쟁사 A', role: 'competitor', positioning: '가성비 PB', usp: '마트 가격의 밀키트', price: '1인분 6,900원',
      keyFeatures: [{ feature: '콜드체인 새벽배송', benefit: '신선도 유지', explainer: '콜드체인이란 생산부터 배송까지 냉장·냉동 온도를 끊김 없이 유지하는 물류 방식', source: '데모' }]
    }
  ],
  competitors: [{ name: '경쟁사 A', positioning: '대형 유통 PB', strengths: ['가격', '접근성'], weaknesses: ['개인화 없음'], keyProducts: ['프레시 밀 박스'], source: '데모' }],
  glossary: [{ term: 'CAC', explanation: '고객 한 명을 데려오는 데 드는 비용 (Customer Acquisition Cost)' }],
  gaps: ['실제 CAC 벤치마크 미확보']
}

const insight: Insight = {
  judgment: { decision: '“결정 대행의 신뢰”와 “함께 먹는 관계”가 성패를 가른다', basis: [{ principle: '대안을 내기 전 4-3-2를 찍고 간다', source: 'doctrine §5', application: '4개 방법론 교차로 전략 축 확정' }], counterCheck: '가격 경쟁 전략도 검토했으나 PB와 정면 승부라 기각', confidence: 'medium' },
  aarrr: [
    { stage: 'acquisition', label: '획득', current: '사내 복지·지인 추천 중심', leak: '광고 클릭 후 가입 이탈', lever: '사내 제휴 채널', health: 3 },
    { stage: 'activation', label: '활성화', current: '첫 박스 수령', leak: '첫 조리 미경험', lever: '10분 레시피 온보딩', health: 2 },
    { stage: 'retention', label: '유지', current: '2회차 유지 가정 60%', leak: '2주차 박스 쌓임', lever: '건너뛰기 무제한', health: 2 },
    { stage: 'revenue', label: '매출', current: '구독 단가 확인 필요', leak: '할인 의존', lever: '취향 큐레이션 프리미엄', health: 3 },
    { stage: 'referral', label: '추천', current: '미설계', leak: '공유 동기 없음', lever: '함께 먹기 초대권', health: 1 }
  ],
  tows: {
    strengths: ['큐레이션 역량', '작은 조직의 속도'], weaknesses: ['브랜드 자산 없음', '물류 규모'],
    opportunities: ['1~2인 가구 증가', '구독 피로 속 “결정 대행” 수요'], threats: ['PB 가격 공세', '배달앱 즉시성'],
    so: ['결정 대행 큐레이션으로 1~2인 가구 공략'], st: ['가격 대신 개인화로 PB 회피'], wo: ['사내 복지 채널로 브랜드 신뢰 차용'], wt: ['권역 한정 런칭으로 물류 리스크 축소']
  },
  stp: {
    segments: [
      { name: '결정 피로 야근러', behavior: '퇴근 후 배달앱을 20분 스크롤', taste: '고민 없는 한 끼', size: '확인 필요', attractiveness: 5 },
      { name: '건강 죄책감 자취러', behavior: '주말에만 장보기', taste: '건강하지만 쉬운', size: '확인 필요', attractiveness: 4 },
      { name: '맞벌이 저녁 협상가', behavior: '메뉴 결정으로 다툼', taste: '둘 다 만족', size: '확인 필요', attractiveness: 3 }
    ],
    target: { segment: '결정 피로 야근러', why: '페인이 가장 반복적이고 강함' },
    positioning: {
      statement: '“오늘 뭐 먹지”를 대신 정해 주는 저녁 파트너',
      xAxis: { low: '가격 중심', high: '경험 중심' }, yAxis: { low: '내가 고름', high: '대신 정해 줌' },
      points: [{ name: '우리', x: 3, y: 4, isUs: true }, { name: 'PB 밀키트', x: -4, y: -2, isUs: false }, { name: '배달앱', x: -1, y: -4, isUs: false }, { name: '프리미엄 밀키트', x: 3, y: -2, isUs: false }]
    }
  },
  cdj: [],
  jtbd: [
    { situation: '야근 후 9시에 집에 도착했을 때', motivation: '고민 없이 제대로 된 한 끼를 먹고 싶다', outcome: '내일을 위해 에너지를 회복할 수 있게', type: 'functional', currentSolution: '배달앱 20분 스크롤', firingTrigger: '배달비·대기시간이 아까울 때', importance: 9, satisfaction: 4 },
    { situation: '주말에 장을 보며', motivation: '건강하게 먹고 있다는 확신을 갖고 싶다', outcome: '죄책감 없이 지내게', type: 'emotional', currentSolution: '과한 장보기 후 폐기', firingTrigger: '냉장고 속 버려지는 재료', importance: 7, satisfaction: 3 },
    { situation: '연인·동료와 저녁 약속이 없을 때', motivation: '누군가와 함께 먹는 기분을 내고 싶다', outcome: '외롭지 않게', type: 'social', currentSolution: '혼밥 + 영상', firingTrigger: '혼밥이 반복될 때', importance: 6, satisfaction: 5 }
  ],
  unit: {
    currency: 'KRW',
    assumptions: [
      { name: '월 구독료', value: 59000, unit: '원', basis: '주 2회 × 2인분 가정 — 확인 필요', verified: false },
      { name: '매출총이익률', value: 32, unit: '%', basis: '업계 통상 수준 추정 — 확인 필요', verified: false },
      { name: '월 이탈률', value: 18, unit: '%', basis: '식품 구독 일반 가정 — 확인 필요', verified: false },
      { name: 'CAC', value: 45000, unit: '원', basis: '사내 제휴 채널 가정 — 확인 필요', verified: false }
    ],
    arpu: 59000,
    grossMarginPct: 32,
    monthlyChurnPct: 18,
    cac: 45000,
    ltv: 104889,
    ltvToCac: 2.3,
    paybackMonths: 2.4,
    sensitivity: [
      { variable: '월 이탈률', change: '18% → 12%', effect: 'LTV/CAC 2.3 → 3.5' },
      { variable: 'CAC', change: '45,000 → 70,000원 (광고 채널)', effect: 'LTV/CAC 1.5 — 광고 중심 확보는 위험' }
    ],
    verdict: '이탈률이 판단을 뒤집는 핵심 변수. 2회차 유지율 실측 전에는 광고 확대 금지'
  },
  competition: {
    players: [
      { name: '대형 유통 PB 밀키트', kind: 'direct', position: '가격·접근성', strength: 5, threat: 3 },
      { name: '프리미엄 밀키트', kind: 'direct', position: '고급 메뉴', strength: 3, threat: 2 },
      { name: '배달앱', kind: 'substitute', position: '즉시성', strength: 5, threat: 5 },
      { name: '편의점 도시락', kind: 'substitute', position: '최저 노력', strength: 4, threat: 3 },
      { name: '식단 관리 앱', kind: 'indirect', position: '건강 관리', strength: 2, threat: 2 }
    ],
    dynamics: ['배달비 상승으로 배달앱 이탈 수요 증가', 'PB의 가격 공세'],
    whitespace: '“오늘 뭐 먹지”를 대신 정해 주는 자리 — 메뉴 수가 아닌 결정 대행'
  },
  superStrategies: [
    { name: '결정 대행 큐레이션', methods: 'TOWS-SO#1 + JTBD#1', description: '취향 학습으로 “오늘 뭐 먹지”를 대신 정한다', strength: 'strong' },
    { name: '신뢰 채널 차용', methods: 'TOWS-WO#1 + 경쟁 whitespace', description: '사내 복지로 첫 경험의 신뢰를 빌린다', strength: 'moderate' },
    { name: '반복 피로 제거', methods: 'AARRR 유지 + JTBD#2', description: '건너뛰기·일시정지로 박스가 쌓이지 않게', strength: 'strong' },
    { name: '함께 먹기 확산', methods: 'AARRR 추천', description: '관계를 매개로 한 초대 구조', strength: 'weak' }
  ],
  ksf: [
    { factor: '첫 박스 조리 완료율', why: '첫인상이 반복 사용을 결정', measure: '수령 후 72시간 내 조리율' },
    { factor: '2회차 유지율', why: '구독 관계의 성립 여부', measure: '2회차 결제 유지율' },
    { factor: '초대 전환율', why: '확산 경로의 실재', measure: '초대권 사용률' }
  ],
  keyClaims: [
    { claim: '우리는 밀키트가 아니라 “저녁 결정”을 판다', support: '결정 피로가 가장 반복적인 페인 (소비자 인사이트)' },
    { claim: '확산은 광고가 아니라 함께 먹는 관계에서 일어난다', support: '추천 단계가 퍼널의 최약점이자 최대 기회 (AARRR)' }
  ]
}

const review = (stage: 'review' | 'refine'): Review => ({
  judgment: { decision: stage === 'review' ? '방향은 유지, 디테일 보강 필요' : '숫자·실행 단계 구체화', basis: [{ principle: '성미 급한 MPM의 재검증', source: 'doctrine §0.7', application: '결과 후 다시 고민' }], counterCheck: '대안 구조 자체는 건전함', confidence: 'medium' },
  verdict: 'improve',
  strengths: ['대안끼리 방향이 확실히 다름'],
  issues: stage === 'review'
    ? [{ target: 'B', problem: '파일럿 이후 개인 전환 경로가 모호', fix: '전환 퍼널과 측정 지표를 명시' }]
    : [{ target: 'A', problem: '비용 범위가 넓음', fix: '인력·기간 기준으로 범위를 좁히고 확인 필요 항목 분리' }]
})

const clone: CloneReview = {
  judgment: { decision: '세 대안 모두 “공급자 관점”에 머물러 있다 — 타깃의 관계 맥락을 중심에 둬야 한다', basis: [{ principle: '왜 하는가 · 영향력 확산', source: 'doctrine §0.5-1', application: '추천이 확산 경로를 설명하지 못함' }], counterCheck: '디테일은 충분히 다듬어졌다', confidence: 'high' },
  macro: { intentPurpose: '목적(지속 가치 검증)에는 부합', targetBrand: '브랜드 약속이 “편리함” 일반론에 머묾', market: 'PB와의 가격 경쟁을 피한 점은 좋음', integration: '확산 장치가 대안마다 약함' },
  insight: '직장인의 저녁은 혼자가 아니라 “누구와 먹나”의 문제 — 관계를 매개로 한 확산이 핵심',
  bigIssue: true,
  directive: '모든 대안의 영향력 확산 경로를 “함께 먹는 관계(동료·연인·가족)” 중심으로 재설계하라'
}

const simulation: Simulation = {
  personas: [
    { name: '야근 잦은 32세 개발자', situation: '주 3회 야근, 냉장고 관리 실패 경험', lens: '귀찮음의 비용', predictedBehavior: '2주차에 박스가 쌓이면 해지', mechanism: '미조리 재료가 죄책감을 만든다', signal: '2주차 “건너뛰기” 비율' },
    { name: '맞벌이 신혼 35세', situation: '공동 의사결정', lens: '관계와 공정성', predictedBehavior: '메뉴 선택권 분배가 만족도 좌우', mechanism: '식사가 관계 의례', signal: '메뉴 변경 빈도' }
  ],
  edgeCases: [{ scenario: '명절·휴가 주간', impact: '일시 해지 급증', mitigation: '일시정지 기본 제공' }],
  blindSpots: ['음식물 쓰레기 부담']
}

const synthesis: Synthesis = {
  executiveSummary: '할인으로는 구독을 못 붙잡는다. 붙잡는 건 “오늘 저녁은 정해 줄게”라는 신뢰다. 사내 복지 파일럿(B)으로 4주 안에 확인하고, 2회차 유지율 60%가 나오면 결정 대행 구독(A)으로 넓힌다.',
  coreRestated: { goal: canvas.goal, purpose: canvas.purpose, brand: canvas.core.brand, consumer: canvas.core.consumer, market: canvas.core.market },
  alternatives: [
    { id: 'A', name: '결정 대행 구독', archetype: '코어 강화형', thesis: '메뉴 고민 해소를 핵심 가치로, 취향 학습형 구독', influencePath: '개인화된 저녁이 “나를 아는 서비스” 경험으로 지인 추천 확산', cost: { estimate: '확인 필요 (개발 2~3개월 인력 기준 추정)', breakdown: ['큐레이션 개발 인력', '메뉴 R&D', '기회비용: 런칭 지연'], needsVerification: ['개발 인력 단가', '메뉴 원가'], valueShiftsWhen: ['자금 여력이 18개월 이상이면 학습 투자로서 가치 상승', '경쟁사가 유사 기능을 먼저 내면 가치 하락'] }, differentiation: '메뉴 수가 아니라 결정을 대신해 주는 정확도', keepInertia: '주간 장보기 리듬(주 1회 수령)', innovation: '취향 학습 기반 자동 큐레이션', omit: ['메뉴 직접 선택 화면(기본값에서 제외)'], firstImpression: '온보딩 3문항 후 “내 취향” 첫 박스', repeatUse: '건너뛰기·자동 조정으로 피로 없는 반복', howItWorks: ['온보딩 취향 진단', '주간 자동 큐레이션', '건너뛰기 무제한'], brandImpact: '“생각 안 해도 되는 저녁” 약속', consumerImpact: '결정 피로 감소', marketImpact: 'PB와 가격이 아닌 경험으로 경쟁', goalFit: 4, purposeFit: 5, tradeoffs: ['개발 비용'], edgeCases: ['취향 급변'], risks: ['큐레이션 품질'], killCriteria: ['2회차 유지율 40% 미만'], reversibility: 'medium', confidence: 'medium', firstSteps: ['취향 진단 프로토타입'] },
    { id: 'B', name: '사내 단체 파일럿', archetype: '실험·헤지형', thesis: '3개 기업 사내 복지로 파일럿 후 개인 구독 확장', influencePath: '회사 동료 간 경험 공유 → 개인 구독 전환', cost: { estimate: '확인 필요 (영업 인력 1명 · 4주)', breakdown: ['B2B 영업 시간', '파일럿 할인 비용'], needsVerification: ['제휴사 부담 비율'], valueShiftsWhen: ['HR 예산 시즌(연초)에는 성사 가능성 상승'] }, differentiation: '개인 광고가 아닌 신뢰 채널을 통한 첫 경험', keepInertia: '사내 복지라는 기존 관행', innovation: '사무실 픽업 기반 구독 전환 경로', omit: ['개인 대상 대규모 광고'], firstImpression: '무료 복지로 부담 없이 체험', repeatUse: '개인 결제 전환 시 가격 저항 확인 필요', howItWorks: ['HR 제휴', '사무실 픽업', '4주 파일럿'], brandImpact: '신뢰 기반 첫 경험', consumerImpact: '시도 장벽 제거', marketImpact: 'B2B2C 빈자리', goalFit: 3, purposeFit: 5, tradeoffs: ['개인 구독 전환 불확실'], edgeCases: ['재택 비율 높은 회사'], risks: ['영업 리드타임'], killCriteria: ['파일럿 후 개인 전환 15% 미만'], reversibility: 'high', confidence: 'medium', firstSteps: ['HR 담당자 10명 인터뷰'] },
    { id: 'C', name: '단건+멤버십 재정의', archetype: '재정의형', thesis: '구독 대신 단건 구매 + 혜택 멤버십으로 약속 부담 제거', influencePath: '부담 없는 단건 구매가 입소문의 진입점', cost: { estimate: '확인 필요 (기존 커머스 구조 활용 시 낮음)', breakdown: ['멤버십 혜택 비용'], needsVerification: ['재구매 할인 손익'], valueShiftsWhen: ['구독 피로가 커지는 시장에서는 가치 상승'] }, differentiation: '차별을 위한 차별에 가까움 — 기존 밀키트와 구조가 같다는 점을 솔직히 인정', keepInertia: '익숙한 단건 구매 습관', innovation: '멤버십 혜택 구조', omit: ['정기 결제 약정'], firstImpression: '가격 비교 후 구매', repeatUse: '반복 구매 동기가 약함', howItWorks: ['단건 주문', '월 멤버십 혜택'], brandImpact: '부담 없는 브랜드', consumerImpact: '해지 스트레스 없음', marketImpact: '기존 밀키트와 정면 경쟁', goalFit: 2, purposeFit: 3, tradeoffs: ['반복 구매 예측 어려움'], edgeCases: ['가격 비교 이탈'], risks: ['차별성 약화'], killCriteria: ['월 재구매 30% 미만'], reversibility: 'high', confidence: 'low', firstSteps: ['가격 민감도 테스트'] }
  ],
  comparison: [
    { criterion: '2회차 유지율', scores: [{ alternativeId: 'A', score: 4, note: '학습 효과' }, { alternativeId: 'B', score: 4, note: '단체 관성' }, { alternativeId: 'C', score: 2, note: '약속 없음' }] },
    { criterion: '브랜드 일관성', scores: [{ alternativeId: 'A', score: 5, note: '' }, { alternativeId: 'B', score: 4, note: '' }, { alternativeId: 'C', score: 3, note: '' }] }
  ],
  recommendation: { pick: 'B', rationale: '가장 위험한 가정(반복 페인)을 낮은 비용으로 검증하면서 A로 확장할 데이터를 얻는다.', conditions: ['4주 내 제휴사 2곳 확보', '파일럿 참여율 30% 이상'], switchTo: '제휴 확보 실패 시 A를 사전 예약 랜딩으로 소규모 검증' },
  factsVsAssumptions: { verifiedFacts: ['(데모) 검증된 사실 없음 — 실제 실행 시 리서치로 채워짐'], assumptions: ['반복 페인 존재', '사내 복지 수요'], unverified: ['CAC', '배송 단가'] },
  nextVerification: [{ check: '반복 페인', method: '사전 예약 랜딩 200명', ifTrue: 'A 개발 착수', ifFalse: 'C로 재정의' }],
  openQuestions: ['배송 권역', '목표 객단가']
}

const brief: Brief = {
  kind: COPY_MODE ? 'copy' : 'plan',
  output: COPY_MODE ? '런칭 캠페인 헤드라인 5개와 보조 문구 (사내 복지 채널 · 인스타그램)' : '런칭 첫 90일 고객 확보 실행 계획서 (절 5개, 창업팀 내부 결정용)',
  audience: COPY_MODE ? '퇴근길 30대 직장인. 밀키트 광고를 이미 많이 봤고, 할인 문구에는 반응하지 않는다' : '창업팀 3명. 첫 고객은 광고로 모아야 한다고 믿고 있다',
  insight: {
    truth: '퇴근한 직장인은 요리가 귀찮은 것보다, 매일 저녁 메뉴를 정하는 일에 더 지쳐 있다',
    tension: '건강하게 먹고 싶지만, 그걸 매일 결정할 힘은 남아 있지 않다'
  },
  proposition: '저녁 메뉴를 대신 정해 주는 구독. 첫 고객은 광고가 아니라 회사 복지 담당자가 데려온다',
  leap: '분석에서 바로 나오는 결론은 "타깃 광고로 첫 500명을 모은다"였다. 하지만 대형 유통사 PB와 가격으로 싸우는 광고 판에서는 CAC를 감당할 수 없다. 그래서 고객이 이미 모여 있는 회사 복지 채널을 입구로 삼고, 약속은 메뉴 수가 아니라 결정 대행으로 바꿨다.',
  notThis: ['메뉴 수 경쟁', '첫 달 반값 할인', '건강·신선·간편 같은 업계 공통 문구'],
  evidence: [
    { point: '저녁 해결 1순위는 배달(38%), 밀키트는 16%', source: '데모 설문' },
    { point: '2회차 유지율이 LTV/CAC를 가장 크게 바꾼다', source: 'SUPER INSIGHT 유닛 이코노믹스' }
  ],
  tone: COPY_MODE ? '친구가 대신 정해 주는 말투. 가볍지만 믿음직하게' : '창업팀이 바로 실행할 수 있게 단정적으로',
  format: COPY_MODE ? '헤드 25자 안팎 + 설명 두 문장' : '절 5개, 각 절 첫 문장이 결론',
  must: ['2회차 결제 유지율 60%를 판정 기준으로 쓴다'],
  mustNot: ['광고 예산을 전제로 한 계획', '확인되지 않은 수치를 사실처럼 쓰기'],
  bar: COPY_MODE ? '광고판에서 처음 봐도 "아, 메뉴 고민을 없애 주는 거구나"가 3초 안에 읽혀야 한다' : '읽고 나서 다음 주 월요일에 무엇을 할지 바로 알 수 있어야 한다',
  angles: [
    { name: '결정 대행', direction: '메뉴를 고르는 수고를 대신 진다는 약속' },
    { name: '퇴근길 장면', direction: '퇴근길에 메뉴를 고민하다 배달앱을 켜는 순간을 정면으로 다룬다' },
    { name: '회사 복지', direction: '회사가 저녁 고민까지 챙겨 준다는 복지의 언어' }
  ],
  outline: COPY_MODE
    ? []
    : [
        { heading: '광고로는 첫 500명을 감당할 수 없다', point: '대형 유통사 PB와 가격으로 싸우는 광고 판에서 CAC 45,000원은 회수되지 않습니다.' },
        { heading: '첫 고객은 회사 복지 안에 이미 모여 있다', point: '사내 복지 담당자 한 명을 설득하면 직원 수십 명이 한 번에 첫 박스를 받습니다.' },
        { heading: '첫 박스가 결정 대행을 증명해야 2회차가 온다', point: '첫 박스에서 메뉴를 고르지 않아도 됐다는 경험이 2회차 결제를 만듭니다.' },
        { heading: '4주 파일럿으로 유지율 60%를 확인한다', point: '제휴사 2곳, 4주, 2회차 유지율 하나만 봅니다.' },
        { heading: '유지율이 나오면 개인 구독으로 넓힌다', point: '파일럿 직원의 개인 결제 전환율 15%가 확장 신호입니다.' }
      ],
  judgment: {
    decision: '결정 대행을 약속하고, 회사 복지를 입구로 삼는다',
    basis: [{ principle: '따지는 머리와 만드는 머리를 나눈다', source: 'doctrine §0.11-2', application: '전략의 추천(B → A)에서 통찰 하나와 입구 하나만 뽑았다' }],
    counterCheck: '복지 예산이 연초에 몰려 있어 시점이 맞지 않을 수 있다. 그래도 제휴 2곳이면 파일럿은 가능하다',
    confidence: 'medium'
  }
}

const rootIssue: RootIssue = {
  task: '구독형 밀키트의 첫 고객을 모으는 전략',
  purpose: '런칭 90일 안에 유료 구독 500명, 2회차 유지율 60%',
  recommended: 0,
  candidates: [
    { issue: '퇴근한 1~2인 가구 직장인이 저녁 메뉴를 스스로 정하지 않아도 되는 상태가 된다', test: '이 안이 있으면, 퇴근길에 배달앱을 켜지 않고 집에 가게 되는가?', why: '구독을 지속시키는 것은 가격이 아니라 결정 피로의 해소다' },
    { issue: '직장인이 회사 동료와 저녁 이야기를 나누며 같은 구독을 이어 간다', test: '이 안이 있으면, 동료에게 이번 주 메뉴를 먼저 말하게 되는가?', why: '확산은 광고보다 관계에서 일어난다' },
    { issue: '주말에 장 보던 사람이 장보기를 건너뛴다', test: '이 안이 있으면, 주말 마트 장보기가 한 번 줄어드는가?', why: '대체 대상이 배달이 아니라 장보기일 수 있다' }
  ]
}

const ROUND_DEMO: Round[] = [
  {
    current: { idea: '회사 복지 채널로 첫 고객을 모으고, 결정 대행을 약속한다', from: '전략의 추천 방향(기본안)' },
    snag: '이 안은 아직 "B2B 제휴 영업"의 변주다. 복지몰에 상품이 하나 더 올라갈 뿐, 퇴근길의 결정이 바뀌지 않는다.',
    moves: [
      { move: 'depth', how: '왜 배달앱을 켜나 → 메뉴를 정할 힘이 없어서 → 왜 없나 → 하루의 마지막 결정이라서', result: '경쟁자는 다른 밀키트가 아니라 퇴근길 지하철에서 배달앱을 여는 10분이다', who: '퇴근길 직장인의', changes: '지하철에서 배달앱 대신 오늘 메뉴 알림을 보고 바로 집으로 간다', keep: true },
      { move: 'twist', how: '시간 비틀기 — 저녁이 아니라 점심에 정한다', result: '점심시간에 동료와 오늘 저녁 메뉴를 같이 고른다', who: '직장인의', changes: '점심 12시 50분에 저녁이 이미 정해져 있다', keep: true }
    ],
    best: { idea: '퇴근 전 5시 50분, 오늘 저녁이 이미 정해져 있다는 알림 한 통으로 배달앱을 여는 10분을 없앤다', why: '경쟁자를 배달앱의 10분으로 다시 정의했다', novelty: 3, use: 4, testAnswer: '알림을 본 사람은 배달앱을 켤 이유가 줄어든다' },
    questions: [
      { type: 'premise', question: '"구독"이라는 말을 빼면, 우리는 무엇을 파는가?', attacks: '구독 모델이 상품이라는 전제', leadsTo: 'depth', gain: '파는 것이 "정해진 저녁"으로 선명해진다', loss: '정기 결제라는 익숙한 틀을 잃는다' },
      { type: 'opposite', question: '이 알림을 가장 싫어할 사람은 누구인가?', attacks: '알림이 친절하다는 전제', leadsTo: 'twist', gain: '알림 피로를 먼저 설계한다', loss: '도달 빈도를 줄여야 한다' },
      { type: 'onlyOne', question: '하나만 남긴다면 박스인가, 알림인가?', attacks: '박스가 핵심이라는 전제', leadsTo: 'combine', gain: '결정 대행이 본체라는 것이 드러난다', loss: '박스의 품질 경쟁에서 한발 물러난다' }
    ],
    fragments: ['점심에 동료와 저녁을 정하는 장면'],
    room: 'more',
    roomWhy: '"정해진 저녁"이 무엇을 파는지 아직 이름이 없다'
  },
  {
    current: { idea: '"구독"을 빼고 "오늘 저녁이 정해져 있는 상태"를 판다', from: '1회차 · 전제 빼기 → 깊이' },
    snag: '"정해진 저녁"은 결국 알림 서비스로 읽힌다. 박스를 받기 전까지 그 상태를 믿을 근거가 없다.',
    moves: [
      { move: 'combine', how: '점심에 동료와 저녁을 정하는 장면 × 회사 복지', result: '팀 단위로 같은 저녁 메뉴를 받는 "팀 저녁"', who: '같은 팀 직장인의', changes: '목요일 점심에 팀이 같이 이번 주 저녁 3개를 고르고, 퇴근길에 사무실 픽업함에서 받아 간다', keep: true }
    ],
    best: { idea: '팀이 점심에 이번 주 저녁을 같이 정하고, 퇴근길 사무실 픽업함에서 받아 가는 "팀 저녁"', why: '결정 대행에 관계가 붙어서 첫 박스 전에 믿을 근거(동료)가 생긴다', novelty: 4, use: 4, testAnswer: '픽업함에서 받아 간 날은 배달앱을 켜지 않는다' },
    questions: [
      { type: 'failFirst', question: '1년 뒤 이 안이 실패했다면, 이유는 팀이 흩어져서인가?', attacks: '팀 단위 소비가 지속된다는 전제', leadsTo: 'breadth', gain: '개인 전환 경로를 미리 설계한다', loss: '팀 단위의 단순함을 잃는다' },
      { type: 'extreme', question: '팀 저녁을 회사 전체로 밀면 사내 식당이 되는가?', attacks: '작은 단위가 좋다는 전제', leadsTo: 'breadth', gain: 'B2B 계약 규모가 커진다', loss: '"우리 팀" 감각이 사라진다' },
      { type: 'premise', question: '사무실 픽업함을 빼도 이 안이 성립하는가?', attacks: '픽업함이 필수라는 전제', leadsTo: 'twist', gain: '재택 직원까지 닿는다', loss: '퇴근길 동선의 이점을 잃는다' }
    ],
    fragments: [],
    room: 'less',
    roomWhy: '두 회차의 조각이 하나로 합쳐졌다. 다음은 표현의 문제다'
  }
]

const editorFor = (n: number): Editor => ({
  vagueMoves: [],
  pickedQuestion: 0,
  card:
    n === 1
      ? { current: '퇴근 전 알림 한 통으로, 퇴근길에 배달앱을 여는 10분을 없애는 안입니다.', snag: '아직 B2B 제휴 영업의 변주입니다. 복지몰에 상품이 하나 늘 뿐, 퇴근길의 결정은 그대로입니다.', question: '"구독"이라는 말을 빼면, 우리는 무엇을 파는가? (전제 빼기 → 깊이)', ifYes: '파는 것이 "오늘 저녁이 정해져 있는 상태"로 선명해집니다. 대신 정기 결제라는 익숙한 틀을 잃습니다.' }
      : { current: '팀이 점심에 이번 주 저녁을 같이 정하고, 퇴근길 사무실 픽업함에서 받아 가는 안입니다.', snag: '팀이 흩어지면 같이 정할 사람이 사라집니다.', question: '1년 뒤 실패했다면, 이유는 팀이 흩어져서인가? (실패 먼저 → 넓이)', ifYes: '팀에서 개인으로 넘어가는 경로를 미리 만듭니다. 대신 팀 단위의 단순함을 잃습니다.' },
  next: n === 1 ? { move: 'combine', direction: '1회차 조각(점심의 동료)과 복지 채널을 부딪혀 본다' } : { move: 'breadth', direction: '개인 전환 사례를 다른 업계(사내 카페 정기권)에서 가져온다' },
  stop: n >= 2,
  stopWhy: n >= 2 ? '두 회차의 조각이 하나로 합쳐졌고, 남은 것은 표현의 문제다' : ''
})

const briefReview: BriefReview = {
  judgment: brief.judgment,
  scopeMatch: true,
  generic: false,
  leapScore: 4,
  insight: '"결정 대행"은 경쟁사 브리프에 들어가면 어색하다. 메뉴 수로 싸우는 경쟁사와 반대 방향이라 고유하다.',
  verdict: 'pass',
  directive: ''
}

const CANDIDATE_BANK: Record<string, { head: string; body: string }[]> = {
  '결정 대행': [
    { head: '오늘 저녁, 고민은 저희가 할게요', body: '매주 취향에 맞춘 메뉴가 정해진 채로 도착합니다. 퇴근길에 메뉴를 고르던 10분이 사라집니다.' },
    { head: '메뉴 정하는 건 저희 일입니다', body: '' },
    { head: '고르지 않아도 되는 저녁', body: '' },
    { head: '건강한 한 끼를 간편하게', body: '' }
  ],
  '퇴근길 장면': [
    { head: '배달앱 켜기 전에, 이미 정해져 있어요', body: '퇴근 전 알림으로 오늘 메뉴를 먼저 알려 드립니다. 배달앱을 열 이유가 없어집니다.' },
    { head: '퇴근길 10분, 메뉴 고민 끝', body: '' },
    { head: '오늘 뭐 먹지? 이제 안 물어도 됩니다', body: '' }
  ],
  '회사 복지': [
    { head: '회사가 저녁 메뉴까지 챙겨 줍니다', body: '사내 복지로 첫 4주를 받아 보고, 마음에 들면 개인 구독으로 이어 갑니다.' },
    { head: '복지 포인트로 받는 저녁', body: '' },
    { head: '야근 없는 날의 복지', body: '' }
  ]
}

const taste: Taste = {
  scored: [],
  picks: [
    { id: 0, why: '약속이 한 줄에 다 들어 있고, 경쟁사 문구와 반대 방향이다' },
    { id: 4, why: '퇴근길 배달앱이라는 실제 장면을 정면으로 건드린다' },
    { id: 7, why: '복지 채널에서 그대로 쓸 수 있다' }
  ],
  rescue: [{ id: 2, how: '"고르지 않아도 되는" 이유(취향 학습)를 설명 문장에 붙이면 쓸모가 생긴다' }],
  killedPatterns: ['"건강·간편"처럼 업계 공통 문구', '장면만 있고 무엇을 해 주는지 빠진 문구'],
  sharpen: '헤드는 25자 안에서 "대신 정해 준다"는 약속을 남기고, 설명에는 무엇이(알림·큐레이션) 해 주는지 넣는다.'
}

const deliverable: Deliverable = COPY_MODE
  ? {
      title: '런칭 캠페인 헤드라인',
      summary: '"저녁 메뉴를 대신 정해 준다"는 약속을 헤드라인 3개로 만들었습니다. 경쟁사가 메뉴 수와 할인을 말하는 동안, 우리는 결정 피로를 덜어 준다는 한 가지만 말합니다. 사내 복지 채널에는 3번을, 인스타그램에는 1번과 2번을 먼저 씁니다.',
      concept: '오늘 저녁, 고민은 저희가 할게요',
      sections: [
        { heading: '1. 오늘 저녁, 고민은 저희가 할게요', body: '매주 취향에 맞춘 메뉴가 정해진 채로 도착합니다. 퇴근길에 메뉴를 고르던 시간이 사라집니다.\n\n- 쓰임: 인스타그램 메인, 랜딩 첫 화면' },
        { heading: '2. 배달앱 켜기 전에, 이미 정해져 있어요', body: '퇴근 전 알림이 오늘 메뉴를 먼저 알려 줍니다. 그래서 배달앱을 열 이유가 없어집니다.\n\n- 쓰임: 퇴근 시간대 인스타그램 스토리' },
        { heading: '3. 회사가 저녁 메뉴까지 챙겨 줍니다', body: '사내 복지로 첫 4주를 받아 보고, 마음에 들면 개인 구독으로 이어 갑니다.\n\n- 쓰임: 사내 복지몰, HR 공지' }
      ]
    }
  : {
      title: '런칭 90일 고객 확보 실행 계획',
      summary: '첫 500명은 광고 대신 회사 복지 채널로 모읍니다. 광고로는 CAC를 회수할 수 없지만, 복지 담당자 한 명을 설득하면 직원 수십 명이 한 번에 첫 박스를 받기 때문입니다. 다음 주에는 HR 담당자 10명 인터뷰부터 시작합니다.',
      concept: '저녁 메뉴를 대신 정해 주는 구독, 첫 고객은 회사 복지가 데려온다',
      sections: [
        { heading: '광고로는 첫 500명을 감당할 수 없다', body: '대형 유통사 PB와 가격으로 싸우는 광고 판에서는 CAC 45,000원을 회수할 수 없습니다. 현재 가정(월 59,000원, 마진 32%, 이탈 18%)에서 LTV/CAC는 2.3배에 그칩니다.\n\n> 퇴근길에 메뉴 고민하다 결국 배달앱 켜요. — 30대 직장인 인터뷰 (데모)' },
        { heading: '첫 고객은 회사 복지 안에 이미 모여 있다', body: '사내 복지 담당자 한 명을 설득하면 직원 수십 명이 한 번에 첫 박스를 받습니다. 그래서 영업 인력 1명이 4주 동안 제휴사 2곳을 여는 것을 첫 목표로 잡습니다.' },
        { heading: '첫 박스가 결정 대행을 증명해야 2회차가 온다', body: '첫 박스를 받을 때 메뉴를 고르지 않아도 됐다는 경험이 2회차 결제로 이어집니다. 그래서 온보딩은 취향 질문 3개로 끝내고, 메뉴 선택 화면은 기본값에서 뺍니다.' },
        { heading: '4주 파일럿으로 유지율 60%를 확인한다', body: '1. **1주차** HR 담당자 10명 인터뷰\n2. 2주차 제휴사 2곳 확정\n3. 3~4주차 사무실 픽업으로 첫 박스 배송\n\n판정 기준은 2회차 결제 유지율 60% 하나입니다.' },
        { heading: '유지율이 나오면 개인 구독으로 넓힌다', body: '파일럿 직원의 개인 결제 전환율이 15%를 넘으면 개인 구독을 엽니다. 넘지 못하면 단건 구매와 멤버십 구조(대안 C)로 바꿉니다.' }
      ]
    }

const docTaste: DocTaste = {
  judgment: brief.judgment,
  flowReads: true,
  leapScore: 4,
  verdict: 'fix',
  issues: [{ heading: '첫 고객은 회사 복지 안에 이미 모여 있다', problem: '복지 담당자가 왜 받아들이는지가 빠졌다', fix: '담당자가 얻는 것(직원 만족 지표, 예산 소진)을 한 문장으로 넣는다' }]
}

export class DemoEngine {
  readonly usage: UsageSummary = {}
  private reworked = new Set<string>()
  private auditCalls = 0

  constructor(private onUsage: (u: UsageSummary) => void) {}

  private bump(model: string) {
    const m = (this.usage[model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 })
    m.input += 2400
    m.output += 900
    m.cacheRead += 9000
    m.calls += 1
    this.onUsage(this.usage)
  }

  async structured<S extends z.ZodType>(opts: CallOptions & { schema: S }): Promise<z.infer<S>> {
    const s = opts.schema as unknown
    const user = typeof opts.user === 'string' ? opts.user : opts.user.map((b) => ('text' in b ? b.text : '')).join('\n')
    await wait(s === SynthesisSchema ? 4200 : s === ContextCanvasSchema ? 3200 : 1800 + Math.random() * 2400, opts.signal)
    this.bump(opts.model)
    const key = s === ReviewSchema ? 'review/refine' : String(Object.keys((opts.schema as unknown as { shape?: object }).shape ?? {}).slice(0, 2))
    demoCalls[key] = (demoCalls[key] ?? 0) + 1
    // 재검증 다음의 두 번째 Review 호출 = 고도화
    if (process.env.SWLM_DEMO_FAIL === 'refine' && key === 'review/refine' && demoCalls[key] === 2 && !demoFailed) {
      demoFailed = true
      throw new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."}}')
    }
    if (s === ContextCanvasSchema) {
      // 의도를 답했으면 재설계된 캔버스는 clear=true
      return (user.includes('<min_answers>') ? { ...canvas, intent: { ...canvas.intent, clear: true, questions: [] } } : canvas) as never
    }
    if (s === FactbookSchema) return factbook as never
    if (s === ReviewSchema) return review(user.includes('<previous_review>') ? 'refine' : 'review') as never
    if (s === CloneReviewSchema) return clone as never
    if (s === InsightSchema) return insight as never
    if (s === DispatchPlanSchema) return structuredClone(plan) as never
    if (s === WorkerReportSchema) {
      const t = plan.tasks.find((x) => user.includes(`제목: ${x.title}`))
      const isRework = user.includes('<rework_request>')
      return report(t?.title ?? '분석', isRework) as never
    }
    if (s === AuditResultSchema) {
      this.auditCalls++
      const t = plan.tasks.find((x) => user.includes(`"title": "${x.title}"`))
      // 두 번째·네 번째 담당은 첫 라운드에서 반려해 "믿지 않는" 루프를 보여 준다.
      const shouldReject = t && (t.id === 't2' || t.id === 't4') && !this.reworked.has(t.id)
      if (shouldReject) {
        this.reworked.add(t.id)
        return audit(false) as never
      }
      return audit(true) as never
    }
    if (s === SimulationSchema) return simulation as never
    if (s === SynthesisSchema) return synthesis as never
    if (s === BriefSchema) return brief as never
    if (s === RootIssueSchema) return rootIssue as never
    if (s === RoundSchema) {
      const n = Number(user.match(/(\d+)회차다/)?.[1] ?? 1)
      return structuredClone(ROUND_DEMO[Math.min(n, ROUND_DEMO.length) - 1]) as never
    }
    if (s === EditorSchema) return editorFor(user.includes('[1회차]') ? 2 : 1) as never
    if (s === ReviewCardSchema) {
      const m = user.match(/<card>\n([\s\S]*?)\n<\/card>/)
      return (m ? JSON.parse(m[1]) : editorFor(1).card) as never
    }
    if (s === BriefReviewSchema) return briefReview as never
    if (s === CandidatesSchema) {
      const angle = user.match(/<angle>\n(.+?) —/)?.[1] ?? '결정 대행'
      return { candidates: (CANDIDATE_BANK[angle] ?? CANDIDATE_BANK['결정 대행']).map((c) => ({ ...c, why: `${angle} 각도` })) } as never
    }
    if (s === TasteSchema) return taste as never
    if (s === DeliverableSchema) return structuredClone(deliverable) as never
    if (s === DocTasteSchema) return docTaste as never
    if (s === SectionFixSchema)
      return {
        sections: [
          {
            heading: '첫 고객은 회사 복지 안에 이미 모여 있다',
            originalHeading: '첫 고객은 회사 복지 안에 이미 모여 있다',
            body: '사내 복지 담당자 한 명을 설득하면 직원 수십 명이 한 번에 첫 박스를 받습니다. 담당자에게는 직원 만족도 설문에 쓸 수 있는 복지 항목이 하나 늘어납니다. 그래서 영업 인력 1명이 4주 동안 제휴사 2곳을 여는 것을 첫 목표로 잡습니다.'
          }
        ]
      } as never
    throw new Error('demo: unknown schema')
  }

  async research(opts: CallOptions, _web = true, _mcp: unknown[] = []): Promise<string> {
    await wait(1500, opts.signal)
    return '(데모) 리서치 메모'
  }
}
