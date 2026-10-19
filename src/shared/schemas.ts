/**
 * 파이프라인 각 단계의 출력 스키마.
 * - main: Claude structured outputs(output_config.format)로 강제하고 다시 검증한다.
 * - renderer: 타입만 사용한다.
 * structured outputs 제약 때문에 min/max 길이 제약은 쓰지 않고, 개수 규칙(대안 ≥3 등)은 코드에서 검증한다.
 */
import { z } from 'zod'

const level = z.enum(['high', 'medium', 'low'])
const axis = z.enum(['brand', 'consumer', 'market', 'goal', 'purpose'])

/** MIN이 항상 체크하는 7가지 (brain/doctrine.md 0.5절) */
export const MIN_CHECKS = {
  why: '왜 하는가 · 영향력 확산',
  cost: '비용',
  value: '비용 대비 가치(유동적)',
  competition: '경쟁·차별화',
  inertia: '관성 위의 혁신',
  subtraction: '불편보다 없는 것',
  experience: '첫인상 vs 반복 사용'
} as const
const checkpoint = z.enum(['why', 'cost', 'value', 'competition', 'inertia', 'subtraction', 'experience', 'other'])

/* ---------- 판단 엔진: MPM의 모든 주요 결정은 MD 문서 근거로 추론한다 ---------- */
export const JudgmentSchema = z.object({
  decision: z.string().describe('이 단계에서 내린 판단 한 문장'),
  basis: z
    .array(
      z.object({
        principle: z.string().describe('적용한 원칙'),
        source: z.string().describe('근거 문서와 위치. 예: doctrine §0.5-4, 02-min-skill.md §3.3'),
        application: z.string().describe('이 과업에 어떻게 적용했는가')
      })
    )
    .describe('판단 근거 2~5개'),
  counterCheck: z.string().describe('반대 증거·다른 해석을 검토한 결과'),
  confidence: level
})
export type Judgment = z.infer<typeof JudgmentSchema>

export const ChallengeQuestionSchema = z.object({
  question: z.string().describe('의도를 묻는 질문'),
  analogy: z.string().describe('질문자가 이해하기 쉽도록 드는 비유. 예: "집을 짓는다면, 살 집인가요 팔 집인가요?"'),
  why: z.string().describe('이 답에 따라 판단이 어떻게 달라지는가'),
  checkpoint,
  ifUnanswered: z.string().describe('답이 없으면 어떤 가정으로 진행하는가')
})
export type ChallengeQuestion = z.infer<typeof ChallengeQuestionSchema>

/** SUPER INSIGHT 방법론 툴박스. MPM이 과제에 맞는 것만 고른다. */
export const METHODS = {
  aarrr: 'AARRR 퍼널',
  tows: 'TOWS 매트릭스',
  stp: 'STP 2.0',
  cdj: 'CDJ 고객 여정',
  jtbd: 'JTBD',
  unit: '유닛 이코노믹스',
  competition: '경쟁 구도'
} as const
export const MethodSchema = z.enum(['aarrr', 'tows', 'stp', 'cdj', 'jtbd', 'unit', 'competition'])
export type Method = z.infer<typeof MethodSchema>

const stageToggle = z.object({ run: z.boolean(), reason: z.string() })

/** 결과물 유형 — 유형마다 제작 방식(발산·문서)과 문체가 다르다 */
export const DELIVERABLE_KINDS = {
  copy: '카피·메시지·네이밍',
  content: '콘텐츠 원고',
  proposal: '기획안·제안서',
  strategy: '전략 보고서',
  plan: '실행 계획',
  analysis: '분석·리서치',
  spec: '제품·서비스 기획서'
} as const
export const DeliverableKindSchema = z.enum(['copy', 'content', 'proposal', 'strategy', 'plan', 'analysis', 'spec'])
export type DeliverableKind = z.infer<typeof DeliverableKindSchema>

/** MPM이 E2E 관점에서 설계하는 공정 (doctrine §0.10) */
export const ProcessPlanSchema = z.object({
  scale: z.enum(['focused', 'standard', 'full']).describe('focused=정의된 범위 집중, full=백지에서 전략까지'),
  rationale: z.string().describe('끝에서 나올 결과물의 질을 기준으로 이 규모를 고른 이유'),
  givenContext: z.string().describe('이미 확정되어 다시 도출하지 않을 전제(전략·정의 등). 없으면 빈 문자열'),
  maxTasks: z.number().describe('하위 담당 수 1~6'),
  factbook: z.object({ mode: z.enum(['full', 'light', 'skip']), reason: z.string() }),
  simulate: stageToggle,
  methods: z.array(MethodSchema).describe('SUPER INSIGHT에 쓸 방법론. 비우면 SUPER INSIGHT 생략'),
  methodsReason: z.string(),
  refine: stageToggle,
  rounds: stageToggle.describe('콘셉트 회차(걸림 → 수 → 대입 → 고르기). 카피·기획안·콘텐츠·기획서처럼 생각의 도약이 결과를 가르면 켠다. 정답형 분석·실행 계획은 판단'),
  clone: stageToggle.describe('MPM 클론의 브리프 심사. 결과물의 방향을 정하는 단계라 거의 항상 켠다')
})
export type ProcessPlan = z.infer<typeof ProcessPlanSchema>

/* ---------- 1. INTAKE: 맥락 캔버스 ---------- */
export const ContextCanvasSchema = z.object({
  title: z.string().describe('프로젝트를 부를 짧은 이름 (20자 내외)'),
  reframe: z.object({
    surfaceRequest: z.string().describe('요청이 표면적으로 말하는 것'),
    realProblem: z.string().describe('허물고 다시 세운 뒤 정의한 실제 문제'),
    questionedPremises: z.array(z.string()).describe('의심한 자동 전제들')
  }),
  goal: z.string().describe('측정 가능한 도착점 (목표)'),
  purpose: z.string().describe('그 목표가 왜 중요한가 (목적). 충돌 시 목적 우선'),
  core: z.object({
    brand: z.string(),
    consumer: z.string(),
    market: z.string()
  }),
  timeHorizon: z.object({ now: z.string(), next: z.string(), long: z.string() }),
  stakeholders: z.array(
    z.object({ who: z.string(), gains: z.string(), loses: z.string(), unknowns: z.string() })
  ),
  criteria: z.array(z.object({ criterion: z.string(), priority: z.number().describe('1이 최우선') })),
  boundaries: z.object({
    fixed: z.array(z.string()).describe('바꿀 수 없는 것'),
    mustNotAssume: z.array(z.string()).describe('가정하면 안 되는 것'),
    undecided: z.array(z.string()).describe('아직 결정되지 않은 것')
  }),
  assumptions: z.array(z.object({ statement: z.string(), risk: level, howToVerify: z.string() })),
  why: z.object({
    influencePath: z.string().describe('타깃의 선택과 사용으로 영향력이 어떻게 확산되는가'),
    warning: z.string().describe('하기 위해 하는/만들기 위해 만드는 일로 보이면 그 이유. 아니면 빈 문자열')
  }),
  cost: z.object({
    known: z.string().describe('요청에서 확인된 예산·자원. 없으면 "확인 필요"'),
    toVerify: z.array(z.string()).describe('비용 판단을 위해 확인해야 할 것')
  }),
  competition: z.object({
    landscape: z.string().describe('경쟁자·대체재와의 관계'),
    meaningfulDifference: z.string().describe('타깃의 선택을 바꿀 수 있는 차이의 방향. 차별을 위한 차별 금지')
  }),
  clarifyingQuestions: z.array(z.string()).describe('사용자에게 확인하면 판단이 크게 바뀌는 질문'),
  materials: z
    .array(
      z.object({
        source: z.string().describe('파일명 또는 URL'),
        summary: z.string(),
        keyPoints: z.array(z.string()).describe('판단에 쓸 핵심 사실·수치·제약'),
        useFor: z.string().describe('이 업무의 어디에 쓰는가')
      })
    )
    .describe('첨부 파일·링크 자료 요약. 자료가 없으면 빈 배열'),
  initialClaims: z.array(z.string()).describe('핵심 주장 가설 1~2개 — 이후 분석으로 검증·수정된다'),
  deliverable: z.object({
    kind: DeliverableKindSchema.describe('요청된 결과물의 유형'),
    output: z.string().describe('MIN에게 넘길 결과물 한 줄 정의 — 무엇을, 얼마나, 어디에 쓰는가'),
    notThis: z.string().describe('결과물로 착각하기 쉬운 것. 예: 목적을 지키는 장치(측정·검증·리스크 관리)는 결과물이 아니라 부록이다')
  }),
  process: ProcessPlanSchema,
  intent: z.object({
    reading: z.string().describe('MPM이 파악한 요청자의 의도'),
    clear: z.boolean().describe('의도가 파악되면 true — 맞는지 확인하지 않고 진행한다'),
    questions: z.array(ChallengeQuestionSchema).describe('의도가 정말 불분명할 때만 1~3개. clear=true면 빈 배열')
  }),
  judgment: JudgmentSchema
})
export type ContextCanvas = z.infer<typeof ContextCanvasSchema>

/* ---------- 2. DISPATCH: 업무 분장 ---------- */
export const TaskSpecSchema = z.object({
  id: z.string().describe('t1, t2 ... 형식'),
  roleId: z.string().describe('roster의 역할 id'),
  title: z.string(),
  contract: z.object({
    objective: z.string().describe('목적: 이 작업으로 무엇을 결정/바꾸는가'),
    responsibility: z.string().describe('책임: 최우선으로 보호·개선할 것'),
    criteria: z.string().describe('판단 기준'),
    boundaries: z.string().describe('경계: 건드리지 말 것, 가정 금지'),
    deliverable: z.string().describe('출력/검증 방식')
  }),
  focusQuestions: z.array(z.string()),
  tier: z.enum(['mpm', 'worker', 'light']).describe('MPM이 판단해 위임할 모델 등급'),
  tierReason: z.string().describe('이 모델 등급을 고른 이유')
})
export type TaskSpec = z.infer<typeof TaskSpecSchema>

export const DispatchPlanSchema = z.object({
  rationale: z.string().describe('왜 이렇게 분장했는가, 무엇을 의도적으로 제외했는가'),
  tasks: z.array(TaskSpecSchema),
  judgment: JudgmentSchema
})
export type DispatchPlan = z.infer<typeof DispatchPlanSchema>

/* ---------- 3. WORK: 하위 담당 보고 ---------- */
export const WorkerReportSchema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      claim: z.string(),
      kind: z.enum(['fact', 'inference', 'hypothesis', 'opinion']),
      basis: z.string().describe('근거 또는 추론 과정'),
      source: z.string().describe('출처. 없으면 빈 문자열'),
      confidence: level
    })
  ),
  implications: z.array(z.object({ axis, point: z.string() })),
  proposals: z.array(z.object({ idea: z.string(), why: z.string(), tradeoff: z.string() })),
  risks: z.array(z.string()),
  unknowns: z.array(z.string())
})
export type WorkerReport = z.infer<typeof WorkerReportSchema>

/* ---------- 4. AUDIT: 믿지 않는 검수 ---------- */
export const AuditResultSchema = z.object({
  verdict: z.enum(['approve', 'rework']),
  trustScore: z.number().describe('0~100'),
  issues: z.array(
    z.object({
      target: z.string().describe('문제가 된 주장/부분'),
      problem: z.string(),
      type: z.enum(['misclassified', 'unsupported', 'optimistic', 'logic_gap', 'off_core', 'missing', 'min_check']),
      severity: level
    })
  ),
  reworkInstruction: z.string().describe('반려 시 구체적 재작업 지시. 승인 시 빈 문자열'),
  keptInsights: z.array(z.string()).describe('검수를 통과해 종합에 쓸 인사이트')
})
export type AuditResult = z.infer<typeof AuditResultSchema>

/* ---------- 5. SIMULATE: 타깃 행동 예측 ---------- */
export const SimulationSchema = z.object({
  personas: z.array(
    z.object({
      name: z.string(),
      situation: z.string().describe('특수 상황/엣지 조건'),
      lens: z.string().describe('적용한 인문 렌즈'),
      predictedBehavior: z.string(),
      mechanism: z.string().describe('왜 그렇게 행동하는가'),
      signal: z.string().describe('예측이 틀렸음을 알려 줄 관찰 신호')
    })
  ),
  edgeCases: z.array(z.object({ scenario: z.string(), impact: z.string(), mitigation: z.string() })),
  blindSpots: z.array(z.string())
})
export type Simulation = z.infer<typeof SimulationSchema>

/* ---------- 6. SYNTHESIZE: 최소 3개 대안 ---------- */
export const AlternativeSchema = z.object({
  id: z.string().describe('A, B, C ...'),
  name: z.string(),
  archetype: z.string().describe('예: 코어 강화형 / 재정의형 / 실험·헤지형'),
  thesis: z.string(),
  howItWorks: z.array(z.string()),
  brandImpact: z.string(),
  consumerImpact: z.string(),
  marketImpact: z.string(),
  influencePath: z.string().describe('타깃의 선택·사용으로 영향력이 확산되는 경로'),
  cost: z.object({
    estimate: z.string().describe('범위로 표기. 근거 없으면 "확인 필요"'),
    breakdown: z.array(z.string()).describe('돈·시간·인력·기회비용'),
    needsVerification: z.array(z.string()).describe('비용 확정을 위해 확인할 것'),
    valueShiftsWhen: z.array(z.string()).describe('어떤 상황·경험이면 비용 대비 가치 판단이 달라지는가')
  }),
  differentiation: z.string().describe('경쟁 대비 타깃의 선택을 바꾸는 차이. 차별을 위한 차별이면 그렇다고 명시'),
  keepInertia: z.string().describe('유지하는 관성(습관·자산)'),
  innovation: z.string().describe('그 위에서 새로 하는 것'),
  omit: z.array(z.string()).describe('불편보다 없는 게 나아서 의도적으로 빼는 것'),
  firstImpression: z.string().describe('첫 경험에서 타깃이 겪는 것'),
  repeatUse: z.string().describe('반복 사용에서 타깃이 겪는 것'),
  goalFit: z.number().describe('1~5'),
  purposeFit: z.number().describe('1~5'),
  tradeoffs: z.array(z.string()),
  edgeCases: z.array(z.string()),
  risks: z.array(z.string()),
  killCriteria: z.array(z.string()).describe('이 조건이 확인되면 이 대안을 철회한다'),
  reversibility: level,
  confidence: level,
  firstSteps: z.array(z.string())
})
export type Alternative = z.infer<typeof AlternativeSchema>

export const SynthesisSchema = z.object({
  executiveSummary: z.string().describe('전략 결론 3~5문장. 어떤 방향을 왜 고르는가. 결과물 자체(카피·문서)는 이후 브리프와 제작 단계가 만든다'),
  coreRestated: z.object({
    goal: z.string(),
    purpose: z.string(),
    brand: z.string(),
    consumer: z.string(),
    market: z.string()
  }),
  alternatives: z.array(AlternativeSchema),
  comparison: z.array(
    z.object({
      criterion: z.string(),
      scores: z.array(z.object({ alternativeId: z.string(), score: z.number(), note: z.string() }))
    })
  ),
  recommendation: z.object({
    pick: z.string().describe('추천 대안 id'),
    rationale: z.string(),
    conditions: z.array(z.string()).describe('이 추천이 유효하기 위한 조건'),
    switchTo: z.string().describe('조건 불충족 시 전환할 대안 id와 이유')
  }),
  factsVsAssumptions: z.object({
    verifiedFacts: z.array(z.string()),
    assumptions: z.array(z.string()),
    unverified: z.array(z.string())
  }),
  nextVerification: z.array(
    z.object({ check: z.string(), method: z.string(), ifTrue: z.string(), ifFalse: z.string() })
  ),
  openQuestions: z.array(z.string())
})
export type Synthesis = z.infer<typeof SynthesisSchema>

/* ---------- FACTBOOK: 하위 담당의 전방위 조사 ---------- */
const factCategory = z.enum(['market', 'consumer', 'brand', 'product', 'competitor', 'technology', 'regulation', 'other'])
export const FactbookSchema = z.object({
  scope: z.string().describe('이 Factbook이 다루는 범위'),
  facts: z.array(
    z.object({
      statement: z.string(),
      category: factCategory,
      source: z.string().describe('발행 주체·문서명'),
      url: z.string().describe('출처 URL. 없으면 빈 문자열'),
      date: z.string().describe('자료 시점. 모르면 빈 문자열'),
      reliability: z.enum(['high', 'medium']).describe('확실히 신뢰 가능한 것만 수록. 낮은 신뢰도 자료는 제외')
    })
  ),
  datasets: z
    .array(
      z.object({
        title: z.string(),
        unit: z.string(),
        chart: z.enum(['bar', 'line', 'pie', 'table']),
        rows: z.array(z.object({ label: z.string(), value: z.number(), note: z.string() })),
        source: z.string()
      })
    )
    .describe('인포그래픽으로 그릴 수 있는 수치 자료'),
  products: z
    .array(
      z.object({
        name: z.string(),
        brand: z.string(),
        role: z.enum(['ours', 'competitor', 'reference']),
        positioning: z.string(),
        usp: z.string(),
        keyFeatures: z.array(
          z.object({
            feature: z.string().describe('1 depth: 기능/특징'),
            benefit: z.string().describe('사용자에게 주는 이점'),
            explainer: z.string().describe('2 depth: 그 기술/개념이 무엇인지 쉽게 설명 (예: HDR이란?)'),
            source: z.string()
          })
        ),
        price: z.string().describe('가격 정보. 모르면 빈 문자열')
      })
    )
    .describe('미션에 등장하는 브랜드·제품과 경쟁 제품'),
  competitors: z.array(
    z.object({
      name: z.string(),
      positioning: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      keyProducts: z.array(z.string()),
      source: z.string()
    })
  ),
  glossary: z.array(z.object({ term: z.string(), explanation: z.string() })),
  gaps: z.array(z.string()).describe('확인하지 못한 것, 신뢰할 자료를 찾지 못한 것')
})
export type Factbook = z.infer<typeof FactbookSchema>

/* ---------- VERIFY: 재검증 · 고도화 · MPM 클론 ---------- */
export const ReviewSchema = z.object({
  judgment: JudgmentSchema,
  verdict: z.enum(['keep', 'improve']),
  strengths: z.array(z.string()),
  issues: z.array(
    z.object({
      target: z.string().describe('대상 (대안 id, 섹션 등)'),
      problem: z.string(),
      fix: z.string().describe('구체적 수정 지시')
    })
  )
})
export type Review = z.infer<typeof ReviewSchema>

export const CloneReviewSchema = z.object({
  judgment: JudgmentSchema,
  macro: z.object({
    intentPurpose: z.string().describe('의도·목적에 비춘 평가'),
    targetBrand: z.string().describe('타깃·브랜드에 비춘 평가'),
    market: z.string().describe('시장 상황에 비춘 평가'),
    integration: z.string().describe('세 축을 통합해 본 평가')
  }),
  insight: z.string().describe('디테일에 매몰되면 놓치는, 디렉터 관점의 통찰'),
  bigIssue: z.boolean().describe('결과를 근본적으로 바꿔야 할 큰 이슈가 있으면 true'),
  directive: z.string().describe('bigIssue일 때 한 번에 해결하는 직권 지시. 아니면 빈 문자열')
})
export type CloneReview = z.infer<typeof CloneReviewSchema>

/* ---------- SUPER INSIGHT: 전략 분석 방법론 + MIN'S 4-3-2 THINKING ---------- */
export const AARRR_STAGES = ['acquisition', 'activation', 'retention', 'revenue', 'referral'] as const
export const CDJ_STAGES = ['awareness', 'consideration', 'purchase', 'advocacy'] as const

export const InsightSchema = z.object({
  judgment: JudgmentSchema,
  aarrr: z
    .array(
      z.object({
        stage: z.enum(AARRR_STAGES),
        label: z.string().describe('획득/활성화/유지/매출/추천'),
        current: z.string().describe('현재 상태 또는 가정'),
        leak: z.string().describe('이탈·병목 구간'),
        lever: z.string().describe('개선 레버'),
        health: z.number().describe('1~5, 이 단계의 건강도')
      })
    )
    .describe('AARRR 5단계 — 선택하지 않았으면 빈 배열'),
  tows: z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    opportunities: z.array(z.string()),
    threats: z.array(z.string()),
    so: z.array(z.string()).describe('강점으로 기회를 잡는 전략'),
    st: z.array(z.string()).describe('강점으로 위협을 막는 전략'),
    wo: z.array(z.string()).describe('기회로 약점을 보완하는 전략'),
    wt: z.array(z.string()).describe('약점과 위협을 최소화하는 전략')
  }),
  stp: z.object({
    segments: z.array(
      z.object({
        name: z.string(),
        behavior: z.string().describe('행동 패턴 (인구통계가 아닌)'),
        taste: z.string().describe('취향·동기'),
        size: z.string().describe('규모 추정. 근거 없으면 "확인 필요"'),
        attractiveness: z.number().describe('1~5')
      })
    ),
    target: z.object({ segment: z.string(), why: z.string() }),
    positioning: z.object({
      statement: z.string(),
      xAxis: z.object({ low: z.string(), high: z.string() }),
      yAxis: z.object({ low: z.string(), high: z.string() }),
      points: z.array(z.object({ name: z.string(), x: z.number().describe('-5~5'), y: z.number().describe('-5~5'), isUs: z.boolean() }))
    })
  }),
  cdj: z
    .array(
      z.object({
        stage: z.enum(CDJ_STAGES),
        label: z.string().describe('인지/고려/구매/옹호'),
        touchpoints: z.array(z.string()).describe('온·오프라인 터치포인트'),
        emotion: z.number().describe('-2(부정)~2(긍정)'),
        pain: z.string(),
        opportunity: z.string()
      })
    )
    .describe('CDJ 4단계 — 선택하지 않았으면 빈 배열'),
  jtbd: z
    .array(
      z.object({
        situation: z.string().describe('When — 어떤 상황에서'),
        motivation: z.string().describe('I want to — 하고 싶은 일'),
        outcome: z.string().describe('So I can — 얻고 싶은 결과'),
        type: z.enum(['functional', 'emotional', 'social']),
        currentSolution: z.string().describe('지금 이 일을 위해 고용하는 것'),
        firingTrigger: z.string().describe('지금 해법을 해고하게 만드는 순간'),
        importance: z.number().describe('1~10'),
        satisfaction: z.number().describe('현재 해법 만족도 1~10')
      })
    )
    .describe('JTBD — 선택하지 않았으면 빈 배열'),
  unit: z
    .object({
      currency: z.string(),
      assumptions: z.array(
        z.object({ name: z.string(), value: z.number(), unit: z.string(), basis: z.string().describe('근거. 없으면 "확인 필요"'), verified: z.boolean() })
      ),
      arpu: z.number().describe('고객당 월 매출'),
      grossMarginPct: z.number().describe('0~100'),
      monthlyChurnPct: z.number().describe('0~100'),
      cac: z.number().describe('고객 획득 비용'),
      ltv: z.number().describe('ARPU × 마진율 ÷ 월 이탈률'),
      ltvToCac: z.number(),
      paybackMonths: z.number().describe('CAC ÷ (ARPU × 마진율)'),
      sensitivity: z.array(z.object({ variable: z.string(), change: z.string(), effect: z.string() })),
      verdict: z.string().describe('이 숫자들이 무엇을 말하는가, 무엇이 확인되면 판단이 바뀌는가')
    })
    .describe('유닛 이코노믹스 — 선택하지 않았으면 숫자 0, 배열 빈 값'),
  competition: z
    .object({
      players: z.array(
        z.object({
          name: z.string(),
          kind: z.enum(['direct', 'indirect', 'substitute']).describe('직접 경쟁 / 간접 경쟁 / 대체재'),
          position: z.string(),
          strength: z.number().describe('1~5'),
          threat: z.number().describe('우리에게 주는 위협 1~5')
        })
      ),
      dynamics: z.array(z.string()).describe('구도를 바꾸는 힘'),
      whitespace: z.string().describe('비어 있는 자리 — 차별을 위한 차별이 아닌 의미 있는 차이')
    })
    .describe('경쟁 구도 — 선택하지 않았으면 빈 값'),
  superStrategies: z
    .array(
      z.object({
        name: z.string(),
        methods: z.string().describe('근거가 된 방법론의 구체적 칸. 예: TOWS-SO#1 + JTBD#2'),
        description: z.string(),
        strength: z.enum(['strong', 'moderate', 'weak']).describe('근거의 강도 — 채우기용이면 weak로 솔직히')
      })
    )
    .describe('4 SUPER STRATEGIES — 정확히 4개'),
  ksf: z
    .array(z.object({ factor: z.string(), why: z.string(), measure: z.string().describe('측정 지표') }))
    .describe("3 KEY SUCCESS FACTORS — 정확히 3개"),
  keyClaims: z
    .array(z.object({ claim: z.string().describe('한 문장의 핵심 주장'), support: z.string().describe('뒷받침 근거') }))
    .describe('2 CORE KEY-CLAIMS — 정확히 2개')
})
export type Insight = z.infer<typeof InsightSchema>

/* ---------- BRIEF: 전략을 결과물로 옮기는 1장 (가장 에너지를 많이 쓰는 단계) ---------- */
export const BriefSchema = z.object({
  kind: DeliverableKindSchema,
  output: z.string().describe('만들 것: 무엇을, 몇 개·얼마 분량으로, 어디에 쓰는가'),
  audience: z.string().describe('결과물을 받아 보는 사람. 그 사람이 지금 알고 믿는 것'),
  insight: z.object({
    truth: z.string().describe('타깃이 이미 겪고 있지만 말로 정리하지 못한 사실 한 가지'),
    tension: z.string().describe('그 사실 안의 긴장 — 원하는 것과 막는 것')
  }),
  proposition: z.string().describe('제안 한 줄 — 결과물 전체가 이 위에 선다'),
  leap: z.string().describe('분석에서 바로 나오는 뻔한 결론은 무엇이었고, 이 제안은 어디서 그것을 넘었는가'),
  notThis: z.array(z.string()).describe('경쟁사·업계가 다 하는 말, 이번에 버릴 뻔한 접근'),
  evidence: z.array(z.object({ point: z.string(), source: z.string() })).describe('제안을 믿게 할 근거 2~4개'),
  tone: z.string(),
  format: z.string().describe('형식·길이·채널 규격'),
  must: z.array(z.string()),
  mustNot: z.array(z.string()),
  bar: z.string().describe('합격선 — 이것보다 못하면 다시 만든다'),
  angles: z.array(z.object({ name: z.string(), direction: z.string() })).describe('탐색할 서로 다른 각도 3~6개'),
  outline: z
    .array(z.object({ heading: z.string().describe('결론이 담긴 제목'), point: z.string().describe('이 절의 첫 문장 = 요점') }))
    .describe('문서형 결과물의 제목 흐름(진단 → 원리 → 해법). 제목만 이어 읽어도 논지가 서야 한다. 카피형이면 빈 배열'),
  judgment: JudgmentSchema
})
export type Brief = z.infer<typeof BriefSchema>

export const BriefReviewSchema = z.object({
  judgment: JudgmentSchema,
  scopeMatch: z.boolean().describe('브리프가 MIN이 요청한 결과물과 같은 종류를 만들게 하는가'),
  generic: z.boolean().describe('통찰·제안이 경쟁사 브리프에도 그대로 들어갈 말이면 true'),
  leapScore: z.number().describe('도약 1~5. 분석을 그대로 옮겨 적었으면 1'),
  insight: z.string().describe('디렉터 관점에서 본 이 브리프의 핵심 문제 또는 강점'),
  verdict: z.enum(['pass', 'rewrite']),
  directive: z.string().describe('rewrite일 때 한 번에 고칠 직권 지시. pass면 빈 문자열')
})
export type BriefReview = z.infer<typeof BriefReviewSchema>

/* ---------- PRODUCE: 결과물 유형별 제작 ---------- */
export const CandidatesSchema = z.object({
  candidates: z.array(
    z.object({
      head: z.string().describe('후보 본문 — 헤드라인·카피·이름·첫 문장'),
      body: z.string().describe('보조 문장 또는 쓰임 설명. 없으면 빈 문자열'),
      why: z.string().describe('이 후보가 브리프의 통찰을 어떻게 건드리는가 (한 줄)')
    })
  )
})
export type Candidates = z.infer<typeof CandidatesSchema>

export const TasteSchema = z.object({
  scored: z
    .array(
      z.object({
        id: z.number(),
        novelty: z.number().describe('새로움 1~5 — 기본안(아무나 낼 답)에서 얼마나 멀리 갔나'),
        use: z.number().describe('쓸모 1~5 — 받는 사람이 실제로 얻는 것이 있나'),
        purposeOk: z.boolean().describe('목적에 어긋나지 않으면 true. false면 지도에 올리지 않는다'),
        guardrail: z.boolean().describe('증거 날조·안전·법규 위반이 없으면 true'),
        note: z.string()
      })
    )
    .describe('모든 후보를 새로움 × 쓸모 지도에 올린다'),
  picks: z.array(z.object({ id: z.number(), why: z.string() })).describe('둘 다 높은 곳에서, 목적 안에서 가장 멀리 간 것 3~7개'),
  rescue: z
    .array(z.object({ id: z.number(), how: z.string().describe('뻔한 답이면 해석으로 멀리 미는 법, 억지 조합이면 쓸모를 보완하는 법') }))
    .describe('버리기 아까운 한쪽만 높은 후보와 살리는 법. 없으면 빈 배열'),
  killedPatterns: z.array(z.string()).describe('버린 후보들의 공통 이유'),
  sharpen: z.string().describe('살린 후보를 더 멀리 밀 방향')
})
export type Taste = z.infer<typeof TasteSchema>

export const DeliverableSchema = z.object({
  title: z.string(),
  summary: z.string().describe('3줄: 무엇을 만들었고, 왜 이 방향인가, 바로 할 일'),
  concept: z.string().describe('결과물이 서 있는 제안 한 줄'),
  sections: z.array(z.object({ heading: z.string(), body: z.string().describe('마크다운') }))
})
export type Deliverable = z.infer<typeof DeliverableSchema>

export const DocTasteSchema = z.object({
  judgment: JudgmentSchema,
  barChecks: z
    .array(z.object({ item: z.string().describe('브리프 합격선의 한 항목'), pass: z.boolean(), why: z.string() }))
    .describe('브리프 합격선을 항목별로 판정한다. 하나라도 미달이면 verdict="fix"이고 issues에 고칠 절을 쓴다'),
  premises: z
    .array(z.object({ claim: z.string().describe('결과물이 진단·전제로 쓴 주장'), source: z.enum(['fact', 'inference', 'hypothesis']), labeled: z.boolean().describe('결과물 본문에 가설·추론이라고 밝혔으면 true') }))
    .describe('진단의 첫 고리가 되는 전제들. 가설·추론인데 labeled=false면 issues에 넣는다'),
  redTeam: z
    .array(z.object({ point: z.string(), status: z.enum(['answered', 'risk', 'ignored']).describe('answered=결과물이 답함, risk=남는 리스크로 명시, ignored=다루지 않음') }))
    .describe('레드팀 지적의 처리 상태. ignored가 있으면 issues에 넣는다'),
  flowReads: z.boolean().describe('제목만 이어 읽어도 논지가 서는가'),
  leapScore: z.number().describe('도약 1~5'),
  verdict: z.enum(['pass', 'fix']),
  issues: z.array(z.object({ heading: z.string().describe('고칠 절의 제목 그대로'), problem: z.string(), fix: z.string() }))
})
export type DocTaste = z.infer<typeof DocTasteSchema>

export const SectionFixSchema = z.object({
  sections: z.array(z.object({ heading: z.string().describe('원래 제목 또는 고친 제목'), originalHeading: z.string().describe('고치기 전 제목'), body: z.string() }))
})

/* ---------- 근본 이슈와 콘셉트 회차 (doctrine §0.12) ---------- */
export const RootIssueSchema = z.object({
  candidates: z
    .array(
      z.object({
        issue: z.string().describe('근본 이슈 — 누구의 무엇이 바뀌어야 하나. 산출물 이름(앱·영상·캠페인)이 들어가면 아직 과업이다'),
        test: z.string().describe('판정 질문 — 어떤 안이든 넣어 볼 질문 하나. "이 안이 있으면 ~하게 되는가?"'),
        why: z.string().describe('이 이슈를 고른 이유 한 문장')
      })
    )
    .describe('서로 다른 근본 이슈 후보 2~3개'),
  task: z.string().describe('과업 — 무엇을 만들어 달라고 했나'),
  purpose: z.string().describe('목적 — 그것이 끝나면 무엇이 되어야 하나'),
  recommended: z.number().describe('추천 후보 번호 (0부터)')
})
export type RootIssue = z.infer<typeof RootIssueSchema>

export const MOVES = { depth: '깊이', breadth: '넓이', twist: '비틀기', combine: '조합' } as const
export const MoveSchema = z.enum(['depth', 'breadth', 'twist', 'combine'])
export const QUESTION_TYPES = { premise: '전제 빼기', extreme: '극단 밀기', opposite: '반대편 서기', onlyOne: '하나만 남기기', failFirst: '실패 먼저' } as const

export const RoundSchema = z.object({
  current: z.object({ idea: z.string().describe('지금 안 — 무엇을 하는 안인지 의미 먼저 한 문장'), from: z.string().describe('어느 회차·수에서 왔나') }),
  snag: z.string().describe('걸림 — 이 안이 결국 뻔해지는 이유 한 문장. 보완점이 아니라 안의 전제를 건드린다'),
  moves: z
    .array(
      z.object({
        move: MoveSchema,
        how: z.string().describe('비틀기면 주체·시간·방향·크기 중 무엇을 / 조합이면 A × B / 깊이면 왜의 사슬 / 넓이면 어느 분야'),
        result: z.string().describe('수를 둔 결과 한 문장'),
        who: z.string().describe('대입: 누구의'),
        changes: z.string().describe('대입: 무엇이 달라지나 — 행동·시간·장소로. 쓸 수 없으면 빈 문자열'),
        keep: z.boolean().describe('대입이 구체적이면 true, 달라지는 것을 쓸 수 없으면 false(버림)')
      })
    )
    .describe('걸림에 맞는 수 1~2개'),
  best: z.object({
    idea: z.string().describe('이번 회차의 최선 — 목적 안에서 기본안에서 가장 멀리 간 것'),
    why: z.string(),
    novelty: z.number().describe('새로움 1~5'),
    use: z.number().describe('쓸모 1~5'),
    testAnswer: z.string().describe('판정 질문에 넣어 본 결과')
  }),
  questions: z
    .array(
      z.object({
        type: z.enum(['premise', 'extreme', 'opposite', 'onlyOne', 'failFirst']),
        question: z.string().describe('평이한 문장으로 쓴 찌르는 질문. 극적인 수사 금지'),
        attacks: z.string().describe('무엇을 공격하나 — 어떤 전제·관습·기본안'),
        leadsTo: MoveSchema,
        gain: z.string().describe('예라고 하면 얻는 것'),
        loss: z.string().describe('예라고 하면 잃는 것')
      })
    )
    .describe('서로 다른 방식의 질문 후보 3개'),
  fragments: z.array(z.string()).describe('버리지만 다음 회차 조합 재료로 남길 조각'),
  room: z.enum(['more', 'less']).describe('더 나아질 여지'),
  roomWhy: z.string()
})
export type Round = z.infer<typeof RoundSchema>

export const ReviewCardSchema = z.object({
  current: z.string().describe('지금 안 — 의미 먼저 한 문장'),
  snag: z.string().describe('걸리는 것 — 이 안이 결국 뻔해지는 이유'),
  question: z.string().describe('찌르는 질문 하나 + (방식 → 이어지는 수)'),
  ifYes: z.string().describe('넣으면 — 질문에 예라고 하면 근본 이슈에서 무엇이 달라지고 무엇을 잃는지')
})
export type ReviewCard = z.infer<typeof ReviewCardSchema>

export const EditorSchema = z.object({
  vagueMoves: z.array(z.number()).describe('대입이 막연해서("인식 개선" 등) 버려야 할 수의 번호(0부터). 없으면 빈 배열'),
  pickedQuestion: z.number().describe('고른 질문 번호 (0부터) — 근본 이슈에 묶여 있으면서 가장 날카로운 것'),
  card: ReviewCardSchema.describe('중간 리뷰 카드. 네 줄 합쳐 400자 이내, 내부 용어·약어 금지'),
  next: z.object({ move: MoveSchema, direction: z.string().describe('MIN이 답하지 않으면 이 방향으로 간다') }),
  stop: z.boolean().describe('더 나아질 여지가 줄었으면 true (예: 두 회차 연속 최선이 그대로)'),
  stopWhy: z.string()
})
export type Editor = z.infer<typeof EditorSchema>

/* ---------- 바뀐 부분만 고치기 (전체 다시 쓰기 대신) ---------- */
export const PatchSchema = z.object({
  patches: z
    .array(
      z.object({
        path: z.string().describe('고칠 필드 경로. 예: executiveSummary / recommendation.rationale / alternatives[A].thesis / alternatives[B].risks / comparison[0]'),
        value: z.string().describe('새 값. 문자열 필드는 그대로, 배열·객체·숫자는 JSON으로')
      })
    )
    .describe('바뀌는 필드만. 바뀌지 않는 필드는 넣지 않는다'),
  changes: z.array(z.object({ was: z.string(), now: z.string(), why: z.string() })).describe('무엇이 무엇으로, 왜 바뀌었나 (사람이 읽는 변경 기록)')
})
export type Patch = z.infer<typeof PatchSchema>

/** 고도화: 콘셉트 회차의 결론을 전략에 반영하고 디테일을 다듬는다 */
export const AlignSchema = z.object({
  judgment: JudgmentSchema,
  superseded: z.array(z.object({ claim: z.string().describe('회차를 거쳐 대체된 전략 주장(4-3-2·추천·대안)'), by: z.string().describe('무엇으로 대체됐나') })),
  patches: PatchSchema.shape.patches,
  changes: PatchSchema.shape.changes
})
export type Align = z.infer<typeof AlignSchema>
