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
  executiveSummary: z.string(),
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
    .describe('AARRR 5단계 모두'),
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
    .describe('CDJ 4단계 모두'),
  superStrategies: z
    .array(z.object({ name: z.string(), methods: z.string().describe('근거 방법론 조합. 예: TOWS-SO + CDJ 옹호'), description: z.string() }))
    .describe('4 SUPER STRATEGIES — 정확히 4개'),
  ksf: z
    .array(z.object({ factor: z.string(), why: z.string(), measure: z.string().describe('측정 지표') }))
    .describe("MIN'S 3 KEY SUCCESS FACTORS — 정확히 3개"),
  keyClaims: z
    .array(z.object({ claim: z.string().describe('한 문장의 핵심 주장'), support: z.string().describe('뒷받침 근거') }))
    .describe('2 CORE KEY-CLAIMS — 정확히 2개')
})
export type Insight = z.infer<typeof InsightSchema>
