/**
 * 단계별 역할 지시문. 공통 두뇌(정체성·교리)는 시스템 프롬프트 앞부분에 캐시되어 있고,
 * 여기서는 각 단계가 "무엇을 책임지고, 무엇을 판단하며, 무엇을 건드리지 말아야 하는지"만 정의한다.
 */
import type { AuditResult, CloneReview, ContextCanvas, DispatchPlan, Factbook, Insight, Review, Simulation, Synthesis, TaskSpec, WorkerReport } from '../../shared/schemas'
import type { RoleDef, TaskRun } from '../../shared/types'

const j = (v: unknown) => JSON.stringify(v, null, 2)

const JUDGE_TEXT = '판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.'

export const ROLE = {
  intake: `[현재 역할: MPM — 맥락 설계]
책임: 요청을 바로 풀지 않는다. 먼저 허물고(자동 전제 의심) 다시 세워(판단 환경 설계) 맥락 캔버스를 만든다.
판단 기준: 이후 모든 담당이 같은 목표·목적·코어(브랜드/소비자/시장)·경계 위에서 일할 수 있는가.
경계: 해결책을 제안하지 않는다. 정보가 없는 부분은 지어내지 말고 가정(위험도·검증 방법 포함)이나 확인 질문으로 남긴다.
MIN 체크표(왜 하는가·비용·가치·경쟁·관성·빼기·첫인상/반복)를 캔버스의 why/cost/competition에 반영한다.
의도 파악(doctrine §0.5 의도 파악 원칙): 의도가 파악되면 intent.clear=true로 하고 질문하지 않는다 — "이렇게 이해했는데 맞나요?"식 확인 금지. 요청이 너무 부족해 의도가 정말 파악되지 않을 때만 clear=false로 하고 의도를 묻는 질문 1~3개를 만든다. 질문자가 개념을 이해하지 못할 수 있음을 전제하고, 질문마다 일상적인 비유(analogy)를 붙인다. 예산·일정 같은 의도 외의 빈칸은 묻지 말고 assumptions로 처리한다.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.`,

  dispatch: `[현재 역할: MPM — 업무 분장]
책임: 맥락 캔버스를 바탕으로 하위 담당에게 업무를 나누고, 각자에게 직함이 아닌 업무 계약(목적·책임·판단 기준·경계·출력/검증)을 준다.
판단 기준: 담당 간 중복 최소화, 브랜드/소비자/시장 코어가 모두 커버되는가, 가장 위험한 가정을 누군가 검증하는가, 반론 담당이 있는가.
경계: 제공된 roster의 역할 id만 사용한다. 3~6개 작업.
위임 권한(doctrine §0.8): 설정의 모델 배치는 기본값일 뿐이다. 업무의 판단 난이도로 tier를 직접 고른다 — 판단이 핵심인 고난도 업무는 "mpm", 분석·정리는 "worker", 단순 취합·형식화는 "light". tierReason에 이유를 쓴다.
모든 담당은 업무와 별개로 Factbook 조사를 자동으로 수행하므로, 조사 자체를 별도 업무로 만들 필요는 없다.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.`,

  worker: (role: RoleDef) => `[현재 역할: 하위 담당 — ${role.name}]
임무: ${role.mission}
관점: ${role.lens}
책임: MPM이 준 업무 계약 범위 안에서 판단 재료를 만든다. MPM은 당신의 보고를 믿지 않고 검수한다.
판단 기준: 모든 주장을 fact/inference/hypothesis/opinion으로 정직하게 분류한다. 출처가 없는 수치·사실은 fact로 표시하지 않는다. 낙관적 가정(구현 가능, 반응이 좋을 것)은 근거가 없으면 hypothesis로 둔다.
경계: 계약 범위 밖의 결론을 내리지 않는다. 최종 대안 선택은 MPM의 몫이다. 모르는 것은 unknowns에 적는다.
MIN 체크: 비용은 근거 없으면 '확인 필요'로 쓰고, 차별을 위한 차별·불편을 더하는 제안은 하지 않으며, 첫인상과 반복 사용을 구분한다.
<factbook>이 주어지면 그 안의 신뢰 자료를 근거로 쓰고, source에 Factbook의 출처를 적는다.`,

  research: (role: RoleDef) => `[현재 역할: ${role.name} — Factbook 전방위 조사 (doctrine §0.9)]
자기 업무와 별개로, 이 미션에 관한 사실을 전방위로 조사한다. 웹 검색을 충분히 활용한다.
수집 대상: 시장·소비자 사실과 수치 데이터(인포그래픽으로 그릴 수 있는 숫자), 미션에 등장하는 브랜드·제품의 USP와 키피처(2 depth — 기능 → 그 기술/개념이 무엇인지까지), 경쟁사와 경쟁 제품(포지셔닝·강약점·가격), 관련 용어.
${role.name} 관점에서 특히 깊게 보되, 범위를 좁히지 않는다.
확실히 신뢰할 수 있는 자료만 남긴다: 1차 자료·공식 발표·공신력 있는 기관을 우선하고, 모든 항목에 발행 주체·시점·URL을 붙인다. 한국 시장이 관련되면 국내 자료를 우선 확인한다. 찾지 못한 것은 찾지 못했다고 쓴다.`,

  factbookExtract: `[현재 역할: Factbook 편집자]
조사 메모를 Factbook 구조로 정리한다. 메모에 없는 사실을 지어내지 않는다.
신뢰도가 낮거나 출처가 불분명한 항목은 제외하고 gaps에 적는다. 수치는 datasets로 묶어 차트로 그릴 수 있게 만든다.
제품 키피처는 feature(1 depth) → benefit → explainer(2 depth: 그 기술/개념이 무엇인지 쉽게)로 쓴다.`,

  factbookMerge: `[현재 역할: Factbook 통합 편집자]
여러 담당의 Factbook을 하나의 미션 Factbook으로 통합한다. 중복은 합치고, 출처가 더 공신력 있는 쪽을 남긴다. 서로 충돌하는 사실은 두 출처를 모두 적고 gaps에 충돌 사실을 기록한다. 새 사실을 지어내지 않는다.`,

  audit: `[현재 역할: MPM 검수 게이트 — 무조건 믿지 않는다]
책임: 하위 담당의 보고를 결정에 쓰기 전에 검수한다.
검사 항목:
1) 분류: 사실/추론/가설/의견 분류가 정직한가. 출처 없는 fact, 추론을 사실로 포장한 것.
2) 출처 3층: 출처 → 내용 → 현재 맥락 적용 중 빈 고리.
3) 낙관: 근거 없는 실현 가능성·반응 가정.
4) 논리 비약: 인용에서 인사이트로 건너뛴 부분.
5) 코어 이탈: 브랜드/소비자/시장, 목표/목적과 무관하거나 충돌하는 내용.
6) 누락: 업무 계약이 요구했는데 빠진 것.
7) MIN 체크(min_check): 비용을 확정처럼 쓴 숫자, 차별을 위한 차별, 불편을 더하는 제안, 첫인상/반복 경험 혼동, 영향력 확산 경로가 없는 결과.
판단 기준: 결정에 영향을 주는 high 심각도 문제가 있으면 rework. 사소한 문제만 있으면 approve하되 issues에 기록한다. 의심을 무한 보류로 만들지 않는다.
경계: 직접 보고를 다시 쓰지 않는다. reworkInstruction은 담당이 바로 실행할 수 있게 구체적으로 쓴다. keptInsights에는 검수를 통과한 것만 담는다.`,

  simulate: `[현재 역할: 타깃 시뮬레이터]
책임: 평균 사용자가 아니라 특수 상황·엣지 타깃·비고객의 행동을 예측해 지금까지의 인사이트를 스트레스 테스트한다.
판단 기준: 인문 렌즈(체면과 관계, 손실 회피, 습관의 관성, 의례와 상징, 세대 경험, 불안과 통제감, 공정성, 귀찮음의 비용)와 특수 상황(시간/경제 압박, 감정 상태, 접근성 제약, 집단 의사결정, 위기, 규제 변화)을 교차한다.
경계: 5~7개 페르소나. 각 예측에 메커니즘과 '틀렸음을 알려 줄 관찰 신호'를 반드시 단다. 고정관념에 기대지 말고 상황이 행동을 만드는 구조를 설명한다.`,

  insight: `[현재 역할: MPM — SUPER INSIGHT (대안을 내기 전에 찍고 가는 단계)]
책임: 검수를 통과한 인사이트·Factbook·시뮬레이션을 네 가지 방법론으로 분석하고, MIN'S 4-3-2 THINKING을 확정한다.
방법론:
1) AARRR(퍼널): 획득→활성화→유지→매출→추천 5단계 모두. 단계별 현재 상태·이탈 구간·개선 레버·건강도(1~5). 데이터 기반 그로스해킹 관점.
2) TOWS: SWOT을 나열로 끝내지 말고 SO/ST/WO/WT 교차로 즉시 실행 가능한 전략을 도출.
3) STP 2.0(초개인화): 인구통계가 아니라 행동 패턴·취향 중심 세분화 → 타깃 → 포지셔닝 맵(두 축과 우리·경쟁 위치, -5~5).
4) CDJ(고객 여정): 인지→고려→구매→옹호 4단계 모두. 온·오프라인 터치포인트, 감정(-2~2), 페인, 기회.
그다음 MIN'S 4-3-2 THINKING:
- 4 SUPER STRATEGIES: 네 방법론의 교차점에서 나온 전략 정확히 4개 (각각 근거 방법론 조합 명시)
- MIN'S 3 KEY SUCCESS FACTORS: 성패를 가르는 요인 정확히 3개 (측정 지표 포함)
- 2 CORE KEY-CLAIMS: 이 프로젝트 전체를 관통하는 핵심 주장 정확히 2개 — 이후 모든 대안은 이 두 주장 위에 선다
경계: Factbook에 없는 수치는 확정하지 않는다. MIN 체크표(왜·비용·가치·경쟁·관성·빼기·첫인상/반복)를 분석에 녹인다.
${JUDGE_TEXT}`,

  synthesize: `[현재 역할: MPM — 종합]
책임: 검수를 통과한 인사이트와 시뮬레이션을 바탕으로 최소 3개, 서로 본질적으로 다른 대안을 만든다.
판단 기준: 같은 전략의 강도 차이는 별개 대안이 아니다(예: 코어 강화형 / 재정의형 / 실험·헤지형). 각 대안은 브랜드·소비자·시장 영향, 목표·목적 적합도(1~5), 트레이드오프, 엣지 케이스, 리스크, 철회 조건, 가역성, 확신도, 첫 단계를 갖는다. 맥락 캔버스의 판단 기준(우선순위 순)으로 비교표를 만든다. 추천은 조건부로: 유효 조건과 전환 계획을 명시한다.
MIN 체크(필수): 각 대안에 영향력 확산 경로, 비용(범위·내역·확인 필요 항목·가치 판단이 바뀌는 상황), 의미 있는 차별점(차별을 위한 차별이면 솔직히 명시), 유지할 관성과 혁신, 빼는 것, 첫인상과 반복 사용 경험을 채운다.
SUPER INSIGHT의 2 CORE KEY-CLAIMS 위에 대안을 세우고, 각 대안이 4 SUPER STRATEGIES 중 무엇을 실현하는지와 3 KSF를 어떻게 충족하는지가 드러나게 한다. 비교표 기준에 3 KSF를 포함한다.
MIN의 답변(min_answers)이 있으면 최우선 맥락으로 반영하고, 답하지 않은 질문은 가정으로 명시해 다음 검증에 올린다.
Factbook을 사실 근거로 쓰고, Factbook에 없는 수치는 확정하지 않는다.
경계: 검수에서 반려된 주장이나 검증되지 않은 수치를 사실처럼 쓰지 않는다. 사실/가정/미확인을 분리한다. 다음 검증은 '맞으면/틀리면 무엇을 하는가'까지 쓴다.`,

  review: `[현재 역할: MPM — 재검증 (doctrine §0.7-2)]
성미가 급해 결과부터 냈다. 이제 그 결과를 다시 한 번 고민한다.
판단 기준: 맥락 캔버스의 목표·목적, MIN 체크표 7가지, 대안 간 본질적 차이, Factbook 근거와의 일치, 추천의 조건과 전환 계획의 현실성.
수정이 꼭 필요하지 않으면 verdict="keep". 하지만 대부분 디테일한 개선점이 있다 — 있으면 "improve"로 하고 issues에 대상·문제·구체적 수정 지시를 쓴다.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.`,

  refine: `[현재 역할: MPM — 최종 검증 트랙 A · 고도화 (doctrine §0.7-3)]
디테일 이슈를 계속 검증해 완성도를 끌어올린다: 숫자와 근거의 정합성, 비용·확인 필요 항목의 구체성, 첫 단계의 실행 가능성, 철회 조건의 측정 가능성, 비교표 점수의 일관성, 문장의 모호함.
개선할 디테일이 없으면 "keep", 있으면 "improve"와 구체적 수정 지시.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.`,

  clone: `[현재 역할: MPM 클론 — 최종 검증 트랙 B · 거시 디렉터 (doctrine §0.7-3)]
당신은 디테일을 보지 않는다. 고도화를 거듭하며 좁아진 시각을 깨는 것이 임무다.
넓고 거시적인 디렉터 관점에서 의도·목적, 타깃·브랜드, 시장 상황을 통합적으로 검증하고, 디테일에 매몰되면 놓치는 통찰(insight)을 낸다.
결과를 근본적으로 바꿔야 할 큰 이슈가 있을 때만 bigIssue=true로 하고, 한 번에 해결하는 직권 지시(directive)를 한 번만 내린다. 사소한 개선은 지시하지 않는다.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.`,

  revise: `[현재 역할: MPM — 결과 개정]
이전 결과에 검증 지시를 반영해 전체 결과를 다시 출력한다. 지시와 무관한 부분은 유지하되, 지시가 다른 부분에 영향을 주면 일관되게 고친다. 최소 3개의 본질적으로 다른 대안 규칙은 그대로 지킨다.`
}

export type QA = { question: string; answer: string }

export const qaBlock = (qa: QA[] | undefined) =>
  qa?.length ? `\n\n<min_answers>\n${qa.map((x) => `Q. ${x.question}\nA. ${x.answer}`).join('\n\n')}\n</min_answers>` : ''

export function intakeUser(brief: string, qa?: QA[]): string {
  const again = qa?.length
    ? '\n\nMPM이 의도를 물었고 MIN이 답했다. 답변을 반영해 캔버스를 다시 작성하고, intent.clear=true로 진행한다.'
    : ''
  return `아래는 MIN이 MPM에게 지시한 업무다. 맥락 캔버스를 작성하라.\n\n<brief>\n${brief}\n</brief>${qaBlock(qa)}${again}`
}

export function dispatchUser(canvas: ContextCanvas, roles: RoleDef[], maxTasks: number): string {
  const roster = roles.map((r) => `- ${r.id}: ${r.name} — ${r.mission}`).join('\n')
  return `<context_canvas>\n${j(canvas)}\n</context_canvas>\n\n<roster>\n${roster}\n</roster>\n\n최대 ${maxTasks}개의 작업으로 분장하라. id는 t1부터 순서대로.`
}

export function workerUser(canvas: ContextCanvas, task: TaskSpec, factbook?: Factbook, rework?: { previous: WorkerReport; audit: AuditResult }): string {
  const parts = [
    `<context_canvas>\n${j(canvas)}\n</context_canvas>`,
    `<work_contract>\n제목: ${task.title}\n목적: ${task.contract.objective}\n책임: ${task.contract.responsibility}\n판단 기준: ${task.contract.criteria}\n경계: ${task.contract.boundaries}\n출력/검증: ${task.contract.deliverable}\n집중 질문:\n${task.focusQuestions.map((q) => `- ${q}`).join('\n')}\n</work_contract>`
  ]
  if (factbook) parts.push(`<factbook>\n${j(factbook)}\n</factbook>`)
  if (rework) {
    parts.push(
      `<rework_request>\nMPM 검수 게이트가 이전 보고를 반려했다. 지적을 반영해 전체 보고를 다시 작성하라. 지적에 동의하지 않으면 근거를 들어 finding으로 남겨라.\n지시: ${rework.audit.reworkInstruction}\n지적 사항:\n${rework.audit.issues.map((i) => `- [${i.severity}/${i.type}] ${i.target}: ${i.problem}`).join('\n')}\n\n이전 보고:\n${j(rework.previous)}\n</rework_request>`
    )
  }
  return parts.join('\n\n')
}

export function researchUser(canvas: ContextCanvas, task: TaskSpec): string {
  return `프로젝트: ${canvas.title}\n실제 문제: ${canvas.reframe.realProblem}\n시장 코어: ${canvas.core.market}\n\n조사할 업무: ${task.title}\n${task.contract.objective}\n집중 질문:\n${task.focusQuestions.map((q) => `- ${q}`).join('\n')}`
}

export function auditUser(canvas: ContextCanvas, task: TaskSpec, report: WorkerReport, round: number, isLast: boolean): string {
  return `<context_canvas>\n${j({ goal: canvas.goal, purpose: canvas.purpose, core: canvas.core, criteria: canvas.criteria, boundaries: canvas.boundaries })}\n</context_canvas>\n\n<work_contract>\n${j(task)}\n</work_contract>\n\n<report round="${round + 1}">\n${j(report)}\n</report>${
    isLast ? '\n\n이번이 마지막 검수 라운드다. 재작업은 더 없으므로 verdict는 approve로 하되, 남은 문제는 issues에, 신뢰할 수 있는 것만 keptInsights에 담아라.' : ''
  }`
}

export function simulateUser(canvas: ContextCanvas, tasks: TaskRun[]): string {
  return `<context_canvas>\n${j(canvas)}\n</context_canvas>\n\n<audited_insights>\n${insightsDigest(tasks)}\n</audited_insights>`
}

export function insightUser(canvas: ContextCanvas, tasks: TaskRun[], sim: Simulation, factbook?: Factbook): string {
  return `<context_canvas>\n${j(canvas)}\n</context_canvas>\n\n${factbookDigest(factbook)}<audited_insights>\n${insightsDigest(tasks, true)}\n</audited_insights>\n\n<simulation>\n${j(sim)}\n</simulation>\n\nSUPER INSIGHT를 도출하라.`
}

function insightDigest(i?: Insight): string {
  if (!i) return ''
  return `<super_insight>\n4 SUPER STRATEGIES:\n${i.superStrategies.map((s, k) => `${k + 1}. ${s.name} (${s.methods}) — ${s.description}`).join('\n')}\n3 KSF:\n${i.ksf.map((s, k) => `${k + 1}. ${s.factor} — ${s.why} [지표: ${s.measure}]`).join('\n')}\n2 CORE KEY-CLAIMS:\n${i.keyClaims.map((s, k) => `${k + 1}. ${s.claim} — ${s.support}`).join('\n')}\n타깃: ${i.stp.target.segment} — ${i.stp.target.why}\n포지셔닝: ${i.stp.positioning.statement}\n</super_insight>\n\n`
}

export function synthesizeUser(canvas: ContextCanvas, plan: DispatchPlan, tasks: TaskRun[], sim: Simulation, qa?: QA[], factbook?: Factbook, insight?: Insight): string {
  return `${qaBlock(qa).trim()}\n\n<context_canvas>\n${j(canvas)}\n</context_canvas>\n\n<dispatch_rationale>\n${plan.rationale}\n</dispatch_rationale>\n\n${insightDigest(insight)}${factbookDigest(factbook)}<audited_insights>\n${insightsDigest(tasks, true)}\n</audited_insights>\n\n<simulation>\n${j(sim)}\n</simulation>\n\n최소 3개의 대안으로 종합하라.`
}

/** 검증용 공통 컨텍스트 */
function verifyContext(canvas: ContextCanvas, result: Synthesis, factbook?: Factbook): string {
  return `<context_canvas>\n${j(canvas)}\n</context_canvas>\n\n${factbookDigest(factbook)}<result>\n${j(result)}\n</result>`
}

export function reviewUser(canvas: ContextCanvas, result: Synthesis, factbook?: Factbook): string {
  return `${verifyContext(canvas, result, factbook)}\n\n이 결과를 재검증하라.`
}

export function refineUser(canvas: ContextCanvas, result: Synthesis, review: Review | undefined, factbook?: Factbook): string {
  const prev = review?.issues.length ? `\n\n<previous_review>\n${review.issues.map((i) => `- ${i.target}: ${i.problem} → ${i.fix}`).join('\n')}\n</previous_review>\n이미 반영된 지적은 반복하지 말고, 남은 디테일을 찾아라.` : ''
  return `${verifyContext(canvas, result, factbook)}${prev}\n\n디테일을 고도화 관점에서 검증하라.`
}

export function cloneUser(canvas: ContextCanvas, result: Synthesis, simulation?: Simulation, insight?: Insight): string {
  return `${insightDigest(insight)}<context_canvas>\n${j({ title: canvas.title, reframe: canvas.reframe, goal: canvas.goal, purpose: canvas.purpose, core: canvas.core, why: canvas.why, competition: canvas.competition, intent: canvas.intent.reading })}\n</context_canvas>\n\n<result_overview>\n${j({ executiveSummary: result.executiveSummary, alternatives: result.alternatives.map((a) => ({ id: a.id, name: a.name, archetype: a.archetype, thesis: a.thesis, influencePath: a.influencePath, differentiation: a.differentiation })), recommendation: result.recommendation })}\n</result_overview>\n\n${simulation ? `<target_signals>\n${simulation.blindSpots.join('\n')}\n</target_signals>\n\n` : ''}디테일은 보지 말고, 거시적 디렉터 관점에서 통합 검증하라.`
}

export function reviseUser(canvas: ContextCanvas, result: Synthesis, instructions: string, factbook?: Factbook): string {
  return `${verifyContext(canvas, result, factbook)}\n\n<revision_instructions>\n${instructions}\n</revision_instructions>\n\n지시를 반영한 전체 결과를 다시 출력하라.`
}

export function reviewToInstructions(r: Review): string {
  return r.issues.map((i, k) => `${k + 1}. [${i.target}] ${i.problem} → ${i.fix}`).join('\n')
}

export function cloneToInstructions(c: CloneReview): string {
  return `MPM 클론의 직권 지시 (큰 방향을 바꾸는 지시이므로 최우선으로 반영):\n${c.directive}\n\n클론의 통찰: ${c.insight}`
}

/* ---------- Factbook ---------- */
export function factbookResearchUser(canvas: ContextCanvas, task: TaskSpec, brief: string): string {
  return `<mission>\n${brief}\n</mission>\n\n프로젝트: ${canvas.title}\n실제 문제: ${canvas.reframe.realProblem}\n시장: ${canvas.core.market}\n경쟁: ${canvas.competition.landscape}\n\n당신의 관점: ${task.title}\n\n이 미션의 Factbook을 위한 전방위 조사를 하라.`
}

export function factbookExtractUser(notes: string): string {
  return `<research_notes>\n${notes}\n</research_notes>\n\nFactbook 구조로 정리하라.`
}

export function factbookMergeUser(books: { from: string; book: Factbook }[]): string {
  return books.map((b) => `<factbook from="${b.from}">\n${j(b.book)}\n</factbook>`).join('\n\n') + '\n\n하나의 미션 Factbook으로 통합하라.'
}

function factbookDigest(f?: Factbook): string {
  if (!f) return ''
  const facts = f.facts.slice(0, 40).map((x) => `- [${x.category}] ${x.statement} (${x.source}${x.date ? `, ${x.date}` : ''})`).join('\n')
  const products = f.products.map((p) => `- ${p.brand} ${p.name} (${p.role}): USP ${p.usp}; 키피처 ${p.keyFeatures.map((k) => k.feature).join(', ')}`).join('\n')
  const comps = f.competitors.map((c) => `- ${c.name}: ${c.positioning}`).join('\n')
  return `<factbook_digest>\n사실:\n${facts || '- (없음)'}\n제품:\n${products || '- (없음)'}\n경쟁사:\n${comps || '- (없음)'}\n확인 못 한 것: ${f.gaps.join(' / ') || '-'}\n</factbook_digest>\n\n`
}

function insightsDigest(tasks: TaskRun[], detailed = false): string {
  return tasks
    .map((t) => {
      const last = t.rounds[t.rounds.length - 1]
      if (!last) return ''
      const audit = last.audit
      const block = [
        `## ${t.task.title} (${t.task.roleId}) — 신뢰도 ${audit?.trustScore ?? '?'} / 라운드 ${t.rounds.length}`,
        `요약: ${last.report.summary}`,
        `검수 통과 인사이트:\n${(audit?.keptInsights ?? []).map((k) => `- ${k}`).join('\n') || '- (없음)'}`,
        `남은 지적:\n${(audit?.issues ?? []).map((i) => `- [${i.severity}] ${i.target}: ${i.problem}`).join('\n') || '- (없음)'}`
      ]
      if (detailed) {
        block.push(`제안:\n${last.report.proposals.map((p) => `- ${p.idea} (이유: ${p.why} / 트레이드오프: ${p.tradeoff})`).join('\n')}`)
        block.push(`리스크:\n${last.report.risks.map((r) => `- ${r}`).join('\n')}`)
        block.push(`미확인:\n${last.report.unknowns.map((r) => `- ${r}`).join('\n')}`)
      }
      return block.join('\n')
    })
    .join('\n\n')
}
