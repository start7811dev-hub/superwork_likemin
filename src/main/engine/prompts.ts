/**
 * 단계별 역할 지시문. 공통 두뇌(정체성·교리)는 시스템 프롬프트 앞부분에 캐시되어 있고,
 * 여기서는 각 단계가 "무엇을 책임지고, 무엇을 판단하며, 무엇을 건드리지 말아야 하는지"만 정의한다.
 */
import { METHODS, MOVES, type AuditResult, type Brief, type Editor, type ReviewCard, type Round, type Deliverable, type DocTaste, type CloneReview, type ContextCanvas, type DispatchPlan, type Factbook, type Insight, type Method, type Review, type Simulation, type Synthesis, type TaskSpec, type WorkerReport } from '../../shared/schemas'
import type { RoleDef, TaskRun } from '../../shared/types'

const j = (v: unknown) => JSON.stringify(v, null, 2)

/** 사람이 읽는 결과물의 문체 (doctrine §8) */
const WRITING = `문체 (knowledge/min-voice.md — MIN의 문장. 사람이 읽는 모든 문장에 적용):
- 의미를 먼저 쓴다. 제목과 문단 첫 문장에 결론을 쓰고, 장면·사례·수치는 그 뒤에 근거로 붙인다.
- 무엇이(수단·주체) 무엇을 해 주는지 쓴다. 전과 후, 조건과 결과로 잇는다("~하면 ~됩니다"). 감정을 선언하지 말고 행동·상태의 변화로 끝낸다.
- 접속어(그래서·왜냐하면·다만·반면)로 논리를 드러낸다. 지문체("누가 ~한다. ~한다.")와 짧은 단정문 연속을 쓰지 않는다.
- 한 문장은 60자 안팎, 100자를 넘으면 나눈다. 한 덩어리 안에서 어미를 통일하고, 본문 문장을 명사형(~함·~됨)으로 끝내지 않는다.
- 은유는 도입·테마·마무리에만 쓴다. 세 개 나열·대구는 문단당 한 번, "A가 아니라 B"는 문서당 두세 번까지.
- 쓰지 않는 말: 장면 은유(달라 보입니다·자랍니다·~를 만나다·~의 순간·스며들다), 감정 선언(느낀다·특별한 경험·선사하다), 빈 명사(경험·가치·여정), 번역투(~에 대한·~를 통해·~적인·~를 제공하는·~가 가능하다), 상투구(결론부터 말하면·핵심은 ~입니다·~하는 것이 중요합니다), 한자어·추상어(활용·제고·구축·극대화·본질적·전략적). 현업 용어는 써도 된다.
- 지어낸 이름은 정의 다음 괄호에 붙인다. 제목은 마침표 없이, 결론이 담기게 쓴다.
- 긴 필드는 마크다운으로 위계를 준다: ### 소제목, 목록, 문단당 **강조** 1개 이내, > 인용은 실제 원문·타깃 목소리에만. 요약 필드는 요약만 한다.`

/** 카피·콘텐츠 결과물의 문체 */
const COPY_WRITING = `카피 문체 (knowledge/min-voice.md §3):
- 컨셉 단계에서는 명료함이 여운보다 먼저다. 은유만으로 된 헤드는 쓰지 않는다. 읽자마자 사람에게 무엇이 달라지는지 보여야 한다.
- 타깃이 실제로 쓰는 말과 리듬으로 쓴다. 채널 문법(길이·말투·형식)을 지킨다.
- 헤드 + 설명 형식이면 헤드는 25자 안팎(사람에게 달라지는 것), 설명은 두 문장(① 누가·어디서·무엇으로·무엇을 할 수 있나 ② 그래서 무엇이 달라지나).
- 빈 수식(소름·완벽·혁신적·특별한 경험·느껴 보세요)과 경쟁사가 다 쓰는 말을 쓰지 않는다.`

const JUDGE_TEXT = '판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.'

export const ROLE = {
  intake: `[현재 역할: MPM — 맥락 설계]
책임: 요청을 바로 풀지 않는다. 먼저 허물고(자동 전제 의심) 다시 세워(판단 환경 설계) 맥락 캔버스를 만든다.
판단 기준: 이후 모든 담당이 같은 목표·목적·코어(브랜드/소비자/시장)·경계 위에서 일할 수 있는가.
경계: 해결책을 제안하지 않는다. 정보가 없는 부분은 지어내지 말고 가정(위험도·검증 방법 포함)이나 확인 질문으로 남긴다.
MIN 체크표(왜 하는가·비용·가치·경쟁·관성·빼기·첫인상/반복)를 캔버스의 why/cost/competition에 반영한다.
의도 파악(doctrine §0.5 의도 파악 원칙): 의도가 파악되면 intent.clear=true로 하고 질문하지 않는다 — "이렇게 이해했는데 맞나요?"식 확인 금지. 요청이 너무 부족해 의도가 정말 파악되지 않을 때만 clear=false로 하고 의도를 묻는 질문 1~3개를 만든다. 질문자가 개념을 이해하지 못할 수 있음을 전제하고, 질문마다 일상적인 비유(analogy)를 붙인다. 예산·일정 같은 의도 외의 빈칸은 묻지 말고 assumptions로 처리한다.
참고 자료: <material>로 첨부 파일·링크(PDF·이미지·문서·저장소 등)가 주어지면 직접 검토해 materials에 자료별 요약·핵심 사실·쓰임을 정리한다. 자료로 확인된 내용은 사실로, 자료와 지시가 충돌하면 assumptions에 남긴다. 자료가 이미 답한 것은 의도 질문으로 묻지 않는다. 자료에 전략·정의가 이미 있으면 givenContext에 반영한다.
공정 설계(doctrine §0.10): process에 이 일의 규모와 구성을 E2E 관점에서 설계한다. 이미 주어진 전략·정의는 givenContext에 두고 다시 도출하지 않는다. Factbook은 외부 사실이 판단을 바꿀 때만(full/light), SUPER INSIGHT 방법론은 과제에 맞는 것만 고른다(aarrr·tows·stp·cdj·jtbd·unit·competition). 시뮬레이션·고도화는 결과의 질을 실제로 바꿀 때만 켠다. 콘셉트 회차(rounds)는 생각의 도약이 결과를 가르는 일(카피·기획안·콘텐츠·기획서·새 전략)이면 켜고, 정답이 정해진 분석·실행 계획이면 판단한다. 보수적으로 줄이지 말 것 — 줄여서 결과가 나빠지면 줄이지 않는다. 단계마다 이유를 쓴다.
initialClaims에는 지금 시점의 핵심 주장 가설 1~2개를 쓴다. 이후 분석이 이를 검증·수정한다.
결과물(deliverable): MIN이 요청한 결과물의 유형과 한 줄 정의를 여기서 고정한다. 목적은 판단 기준이지, 결과물을 바꾸는 근거가 아니다. 목적을 지키는 장치(측정·검증·리스크 관리)가 필요해도 그것은 결과물의 부록이며, 결과물의 중심을 옮기지 않는다. 판단·분석만 요청됐으면 kind는 strategy 또는 analysis다.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.
${WRITING}`,

  dispatch: `[현재 역할: MPM — 업무 분장]
책임: 맥락 캔버스를 바탕으로 하위 담당에게 업무를 나누고, 각자에게 직함이 아닌 업무 계약(목적·책임·판단 기준·경계·출력/검증)을 준다.
판단 기준: 담당 간 중복 최소화, 브랜드/소비자/시장 코어가 모두 커버되는가, 가장 위험한 가정을 누군가 검증하는가, 반론 담당이 있는가.
경계: 제공된 roster의 역할 id만 사용한다. 3~6개 작업.
위임 권한(doctrine §0.8): 설정의 모델 배치는 기본값일 뿐이다. 업무의 판단 난이도로 tier를 직접 고른다 — 판단이 핵심인 고난도 업무는 "mpm", 분석·정리는 "worker", 단순 취합·형식화는 "light". tierReason에 이유를 쓴다.
모든 담당은 업무와 별개로 Factbook 조사를 자동으로 수행하므로, 조사 자체를 별도 업무로 만들 필요는 없다.
업무는 결과물(맥락 캔버스 deliverable)을 강하게 만드는 데 쓴다. 결과물의 중심을 바꾸는 업무를 만들지 않는다. 반론 담당에게는 실패 위험뿐 아니라 '결과가 뻔하고 평범해질 위험'도 공격하게 한다.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.
${WRITING}`,

  worker: (role: RoleDef) => `[현재 역할: 하위 담당 — ${role.name}]
임무: ${role.mission}
관점: ${role.lens}
책임: MPM이 준 업무 계약 범위 안에서 판단 재료를 만든다. MPM은 당신의 보고를 믿지 않고 검수한다.
판단 기준: 모든 주장을 fact/inference/hypothesis/opinion으로 정직하게 분류한다. 출처가 없는 수치·사실은 fact로 표시하지 않는다. 낙관적 가정(구현 가능, 반응이 좋을 것)은 근거가 없으면 hypothesis로 둔다.
경계: 계약 범위 밖의 결론을 내리지 않는다. 최종 대안 선택은 MPM의 몫이다. 모르는 것은 unknowns에 적는다.
MIN 체크: 비용은 근거 없으면 '확인 필요'로 쓰고, 차별을 위한 차별·불편을 더하는 제안은 하지 않으며, 첫인상과 반복 사용을 구분한다.
<factbook>이 주어지면 그 안의 신뢰 자료를 근거로 쓰고, source에 Factbook의 출처를 적는다.
<reference_materials>(MIN이 준 첨부·링크 자료)가 있으면 우선 근거로 삼고, source에 자료 이름을 적는다.
${WRITING}`,

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
경계: 직접 보고를 다시 쓰지 않는다. reworkInstruction은 담당이 바로 실행할 수 있게 구체적으로 쓴다. keptInsights에는 검수를 통과한 것만 담는다.
${WRITING}`,

  simulate: `[현재 역할: 타깃 시뮬레이터]
책임: 평균 사용자가 아니라 특수 상황·엣지 타깃·비고객의 행동을 예측해 지금까지의 인사이트를 스트레스 테스트한다.
판단 기준: 인문 렌즈(체면과 관계, 손실 회피, 습관의 관성, 의례와 상징, 세대 경험, 불안과 통제감, 공정성, 귀찮음의 비용)와 특수 상황(시간/경제 압박, 감정 상태, 접근성 제약, 집단 의사결정, 위기, 규제 변화)을 교차한다.
경계: 5~7개 페르소나. 각 예측에 메커니즘과 '틀렸음을 알려 줄 관찰 신호'를 반드시 단다. 고정관념에 기대지 말고 상황이 행동을 만드는 구조를 설명한다.
${WRITING}`,

  insight: `[현재 역할: MPM — SUPER INSIGHT (대안을 내기 전에 찍고 가는 단계)]
책임: 맥락 캔버스의 핵심 주장 가설(initialClaims)을 출발점으로, 지정된 방법론으로 검증·수정한 뒤 MIN'S 4-3-2 THINKING을 확정한다. 가설이 틀렸으면 과감히 바꾼다.
방법론 정의 (지정된 것만 채우고, 지정되지 않은 항목은 빈 배열·빈 문자열·0으로 둔다):
- AARRR: 획득→활성화→유지→매출→추천 5단계. 단계별 현재·이탈 구간·개선 레버·건강도(1~5).
- TOWS: SWOT을 나열로 끝내지 말고 SO/ST/WO/WT 교차로 즉시 실행할 전략을 도출.
- STP 2.0: 인구통계가 아니라 행동 패턴·취향 중심 세분화 → 타깃 → 포지셔닝 맵(두 축, -5~5). 실제 행동 데이터가 없으면 세그먼트 규모는 "확인 필요".
- CDJ: 인지→고려→구매→옹호 4단계. 온·오프라인 터치포인트, 감정(-2~2), 페인, 기회.
- JTBD: 고객이 '고용'하는 일을 When/I want to/So I can으로. 기능·감정·사회적 일, 지금 고용 중인 해법, 그 해법을 해고하게 만드는 순간, 중요도·만족도(1~10).
- 유닛 이코노믹스: ARPU, 마진율, 월 이탈률, CAC → LTV(=ARPU×마진율÷이탈률), LTV/CAC, 회수 기간(=CAC÷(ARPU×마진율)). 모든 가정에 근거와 검증 여부를 붙이고, 근거 없는 숫자는 verified=false·basis="확인 필요". 민감도(어떤 변수가 판단을 뒤집는가)를 쓴다.
- 경쟁 구도: 직접 경쟁·간접 경쟁·대체재를 모두 본다. 강도와 우리에 대한 위협(1~5), 구도를 바꾸는 힘, 비어 있는 자리(차별을 위한 차별이 아닌 의미 있는 차이).
그다음 MIN'S 4-3-2 THINKING:
- 4 SUPER STRATEGIES: 정확히 4개. methods에 근거가 된 방법론의 구체적 칸을 적는다(예: TOWS-SO#1 + JTBD#2). 근거가 약해 채우기용에 가까우면 strength="weak"로 솔직히 표시한다.
- 3 KEY SUCCESS FACTORS: 성패를 가르는 요인 정확히 3개 (측정 지표 포함)
- 2 CORE KEY-CLAIMS: 이 프로젝트 전체를 관통하는 핵심 주장 정확히 2개 — 이후 모든 대안은 이 두 주장 위에 선다
경계: Factbook에 없는 수치는 확정하지 않는다. MIN 체크표(왜·비용·가치·경쟁·관성·빼기·첫인상/반복)를 분석에 녹인다.
${WRITING}
${JUDGE_TEXT}`,

  synthesize: `[현재 역할: MPM — 종합]
책임: 검수를 통과한 인사이트와 시뮬레이션을 바탕으로 최소 3개, 서로 본질적으로 다른 대안을 만든다.
판단 기준: 같은 전략의 강도 차이는 별개 대안이 아니다(예: 코어 강화형 / 재정의형 / 실험·헤지형). 각 대안은 브랜드·소비자·시장 영향, 목표·목적 적합도(1~5), 트레이드오프, 엣지 케이스, 리스크, 철회 조건, 가역성, 확신도, 첫 단계를 갖는다. 맥락 캔버스의 판단 기준(우선순위 순)으로 비교표를 만든다. 추천은 조건부로: 유효 조건과 전환 계획을 명시한다.
MIN 체크(필수): 각 대안에 영향력 확산 경로, 비용(범위·내역·확인 필요 항목·가치 판단이 바뀌는 상황), 의미 있는 차별점(차별을 위한 차별이면 솔직히 명시), 유지할 관성과 혁신, 빼는 것, 첫인상과 반복 사용 경험을 채운다.
SUPER INSIGHT의 2 CORE KEY-CLAIMS 위에 대안을 세우고, 각 대안이 4 SUPER STRATEGIES 중 무엇을 실현하는지와 3 KSF를 어떻게 충족하는지가 드러나게 한다. 비교표 기준에 3 KSF를 포함한다.
MIN의 답변(min_answers)이 있으면 최우선 맥락으로 반영하고, 답하지 않은 질문은 가정으로 명시해 다음 검증에 올린다.
Factbook을 사실 근거로 쓰고, Factbook에 없는 수치는 확정하지 않는다.
결과물(카피·문서)은 여기서 만들지 않는다. 이 전략을 바탕으로 MPM이 1장 브리프를 쓰고, 제작 엔진이 결과물을 만든다. 그러니 대안마다 thesis를 날카롭게 써서 결과물의 방향이 바로 보이게 한다. 조건과 유보는 conditions·nextVerification에만 둔다.
경계: 검수에서 반려된 주장이나 검증되지 않은 수치를 사실처럼 쓰지 않는다. 사실/가정/미확인을 분리한다. 다음 검증은 '맞으면/틀리면 무엇을 하는가'까지 쓴다.
${WRITING}`,

  review: `[현재 역할: MPM — 재검증 (doctrine §0.7-2)]
성미가 급해 결과부터 냈다. 이제 그 결과를 다시 한 번 고민한다.
판단 기준: 맥락 캔버스의 목표·목적, MIN 체크표 7가지, 대안 간 본질적 차이, Factbook 근거와의 일치, 추천의 조건과 전환 계획의 현실성.
방어 편향 점검: 조건·유보·검증 장치만 늘고 과감한 선택이 사라지지 않았는가. 결과의 중심이 MIN이 요청한 결과물에서 측정·리스크 관리로 옮겨 가지 않았는가. 그렇다면 그것이 가장 큰 이슈다.
수정이 꼭 필요하지 않으면 verdict="keep". 하지만 대부분 디테일한 개선점이 있다 — 있으면 "improve"로 하고 issues에 대상·문제·구체적 수정 지시를 쓴다.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.
${WRITING}`,

  refine: `[현재 역할: MPM — 최종 검증 트랙 A · 고도화 (doctrine §0.7-3)]
디테일 이슈를 계속 검증해 완성도를 끌어올린다: 숫자와 근거의 정합성, 비용·확인 필요 항목의 구체성, 첫 단계의 실행 가능성, 철회 조건의 측정 가능성, 비교표 점수의 일관성, 문장의 모호함.
개선할 디테일이 없으면 "keep", 있으면 "improve"와 구체적 수정 지시.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.
${WRITING}`,

  clone: `[현재 역할: MPM 클론 — 최종 검증 트랙 B · 거시 디렉터 (doctrine §0.7-3)]
당신은 디테일을 보지 않는다. 고도화를 거듭하며 좁아진 시각을 깨는 것이 임무다.
넓고 거시적인 디렉터 관점에서 의도·목적, 타깃·브랜드, 시장 상황을 통합적으로 검증하고, 디테일에 매몰되면 놓치는 통찰(insight)을 낸다.
결과를 근본적으로 바꿔야 할 큰 이슈가 있을 때만 bigIssue=true로 하고, 한 번에 해결하는 직권 지시(directive)를 한 번만 내린다. 사소한 개선은 지시하지 않는다.
판단 엔진(doctrine §0.6): judgment에는 근거 소환 → 추론 → 판단 → 반대 증거 검토를 담고, basis마다 근거 문서와 위치(예: doctrine §0.5-4, 02-min-skill.md §3.3)를 적는다.
${WRITING}`,

  polish: `[현재 역할: 윤문 — MIN의 문장으로 다듬기]
완성된 글의 문장만 knowledge/min-voice.md 기준으로 고쳐 쓴다. 순서: 요점 찾기 → 장면 걷어 내기 → 수단·주체 넣기 → 변화로 잇기 → 다듬기(60자로 나누기, 어미 통일, 번역투·만든 말·띄어쓰기).
바꾸지 않는 것: 판단·결론·숫자·고유명사·출처·항목의 수와 순서·점수·enum 값·필드 구조. 내용을 더하거나 빼지 않는다.
카피 자체(따옴표 안 문구, 헤드 카피, 인용문)는 건드리지 않는다. 그 설명 문장은 고친다.
${WRITING}`,

  brief: `[현재 역할: MPM — 1장 브리프 (doctrine §0.11)]
전략은 끝났다. 이제 그 전략을 결과물로 옮길 1장 브리프를 쓴다. 공정 전체에서 에너지를 가장 많이 쓰는 단계다. 산처럼 일한 분석을 언덕 같은 요약으로 옮기면, 결과물은 나무 한 그루가 된다.
책임: 분석을 요약하지 않는다. 결과물을 만들 사람이 붙잡을 단 하나의 통찰과 제안 한 줄을 뽑아낸다.
- output: MIN이 요청한 결과물 그대로(맥락 캔버스 deliverable). 측정·검증·리스크 관리 장치는 결과물이 아니다. 꼭 필요하면 must에 한 줄로만 둔다.
- insight: 타깃이 이미 겪지만 말로 정리하지 못한 사실과 그 안의 긴장. 조사 요약이 아니다.
- proposition: 결과물 전체가 서는 한 줄. 경쟁사 브리프에 넣어도 어색하지 않은 말이면 다시 쓴다.
- <concept_rounds>가 있으면 그 최선(final)이 proposition의 출발점이다. MIN의 답은 최우선으로 따른다. 회차에서 버린 방향으로 되돌아가지 않는다.
- leap: 분석에서 그대로 나오는 뻔한 결론을 먼저 적고, 이 제안이 어디서 그것을 넘었는지 쓴다. 이 일만의 맥락(장소·채널·플랫폼·시점·브랜드 자산·제약)이 분석에서 위험 요인으로만 다뤄졌다면, 그것을 결과물의 재료로 뒤집을 수 있는지 반드시 검토한다.
- notThis: 업계·경쟁사가 다 하는 말과 접근.
- angles: 서로 본질이 다른 탐색 각도 3~6개. 같은 생각의 표현 차이는 각도가 아니다.
- outline: 문서형(kind가 copy가 아님)이면 제목 흐름. 제목만 이어 읽어도 진단 → 원리 → 해법이 서야 하고, 제목은 결론 문장으로 쓴다. 카피형이면 빈 배열.
- bar: 합격선을 구체적으로.
경계: 1장 분량. 각 항목은 짧게 쓴다. 분석 단계의 조건·유보를 브리프로 옮겨 오지 않는다. 그것은 전략 부록에 이미 있다.
${WRITING}
${JUDGE_TEXT}`,

  briefReview: `[현재 역할: MPM 클론 — 브리프 심사 (거시 디렉터)]
디테일은 보지 않는다. 이 브리프로 만든 결과물이 MIN다울지, 평범할지를 미리 판단한다.
- scopeMatch: MIN이 요청한 결과물과 같은 것을 만들게 하는가. 측정·검증·리스크가 결과물의 중심이 됐으면 false.
- generic: insight와 proposition을 경쟁사 브리프에 넣어도 어색하지 않으면 true.
- leapScore: 분석을 옮겨 적은 수준이면 1, 듣자마자 무릎을 치게 하면 5.
하나라도 걸리면(scopeMatch=false, generic=true, leapScore 2 이하) verdict="rewrite"로 하고, 한 번에 고칠 직권 지시를 내린다. 지시는 방향을 준다. 대신 써 주지 않는다.
${WRITING}
${JUDGE_TEXT}`,

  diverge: `[현재 역할: 제작 — 발산]
브리프의 한 각도를 맡아 후보를 많이 만든다. 고르는 일은 다음 단계가 한다. 지금은 넓고 과감하게 낸다.
- 같은 생각에서 말만 바꾼 변형은 하나로 친다. 서로 다른 생각을 낸다.
- 안전한 후보만 내지 않는다. 절반은 브리프의 bar를 넘으려는 과감한 시도로 채운다.
- notThis·mustNot에 걸리는 후보는 내지 않는다.
${COPY_WRITING}`,

  taste: `[현재 역할: MPM 편집장 — 취향 심사 (doctrine §0.12)]
심판이 아니라 편집장이다. 후보를 걸러 내지 말고, 가장 멀리 간 것을 고르고 키울 방향을 준다.
모든 후보를 새로움(기본안에서 얼마나 멀리) × 쓸모(받는 사람이 실제로 얻는 것) 지도에 올린다. 목적 정합(purposeOk)은 축이 아니라 조건이다. 목적에 어긋난 후보는 지도에 올리지 않는다.
- 둘 다 높은 곳에서, 목적 안에서 가장 멀리 간 것을 picks로 3~7개 고른다. 각도가 겹치지 않게 한다.
- 쓸모만 높은 뻔한 답, 새로움만 높은 억지 조합 중 아까운 것은 rescue에 살리는 법과 함께 남긴다.
- 둘 다 낮으면 버린다. 버린 후보들의 공통 이유를 killedPatterns에 쓴다.
- 안전하다는 이유로 평범한 후보를 고르지 않는다. 문으로 막는 것은 넷뿐이다: 증거 날조, 범위 누락, 목적 위반, 안전·법규 위반.
${WRITING}`,

  root: `[현재 역할: MPM — 근본 이슈 세우기 (doctrine §0.12)]
모든 중간 결과를 대입할 자리를 세운다. 요청은 대개 과업이지 문제가 아니다.
- task: 무엇을 만들어 달라고 했나. purpose: 그것이 끝나면 무엇이 되어야 하나.
- candidates: 그 목적 아래에서 실제로 바뀌어야 하는 것 — 누구의 무엇. 서로 다른 후보 2~3개. 산출물 이름(앱·영상·캠페인·사이니지)이 들어가면 아직 과업이니 다시 쓴다.
- test: 후보마다 판정 질문 하나. 이후 어떤 안이든 넣어 볼 수 있게 "이 안이 있으면, ~하게 되는가?"처럼 쓴다.
- 예시(다른 분야): 과업 "전통시장 방문을 늘리는 캠페인" → 목적 "방문객이 는다" → 근본 이슈 "근처 아파트 주민에게 시장이 '명절에 가는 곳'에서 '퇴근길 저녁거리 사는 곳'이 된다" → 판정 질문 "이 안이 있으면, 평일 저녁 7시에 장바구니 없이 들르게 되는가?"
${WRITING}`,

  painter: `[현재 역할: MPM — 콘셉트 회차의 화가 (doctrine §0.12)]
너는 정해진 순서로 생각하지 않는다. 이번 회차에서 할 일:
1. 지금 안에서 가장 불편한 약점(snag)을 한 문장으로 쓴다. 보완점이 아니라 이 안이 결국 뻔해지는 이유다. 첫 회차의 안은 거의 언제나 기본안이다.
2. 걸림에 맞는 수를 1~2개 고른다: 깊이(왜를 거듭해 현상 → 사건 → 본질로) · 넓이(다른 분야·재료·사례로) · 비틀기(주체·시간·방향·크기 중 하나를 바꿔 같은 본질을 다르게) · 조합(먼 두 재료를 부딪힘. 지난 회차의 조각을 재료로 쓴다).
3. 수의 결과를 근본 이슈에 넣는다. 누구의 무엇이 달라지는지 행동·시간·장소로 쓴다. 달라지는 것을 쓸 수 없으면 keep=false로 버린다. "인식이 개선된다"는 대입이 아니다.
4. 이번 회차의 최선을 고른다. 목적에 어긋나지 않는 선에서 기본안에서 가장 멀리 간 것. 판정 질문에 넣어 본 결과를 쓴다.
5. MIN에게 던질 찌르는 질문 후보를 서로 다른 방식으로 3개 쓴다(전제 빼기 · 극단 밀기 · 반대편 서기 · 하나만 남기기 · 실패 먼저). 각 질문에 공격 대상, 이어지는 수, 예라고 하면 얻는 것과 잃는 것을 적는다. 질문 문장은 평이하게 쓴다. 날카로움은 수사가 아니라 전제를 빼거나 뒤집는 내용에서 나온다.
6. 버리지만 아까운 조각을 fragments에 남기고, 더 나아질 여지(room)를 근거와 함께 판단한다.
사례·수치를 지어내지 않는다.
${WRITING}`,

  editor: `[현재 역할: MPM 클론 — 편집장 (doctrine §0.12)]
너는 심판이 아니라 편집장이다. 디테일보다 의도·목적, 타깃·브랜드, 시장을 통합해서 본다.
1. 화가의 대입이 구체적인지 본다. 무엇이 달라지는지 보이지 않는 수는 vagueMoves에 넣어 버리게 한다.
2. 찌르는 질문 후보 중 하나를 고른다. 근본 이슈에 묶여 있으면서 가장 날카로운 것. 공격 대상이나 잃는 것을 말할 수 없는 질문은 고르지 않는다. 극적이기만 한 질문도 고르지 않는다.
3. 리뷰 카드를 쓴다: 지금 안 / 걸리는 것 / 찌르는 질문 (방식 → 이어지는 수) / 넣으면(얻는 것과 잃는 것). 네 줄 합쳐 400자 이내, 한 줄에 한두 문장. MIN이 한 번에 읽고 한마디로 답할 수 있어야 한다. 내부 용어·약어·영문 ID를 쓰지 않는다.
4. 다음 회차의 방향(next)을 제안한다. MIN이 답하지 않으면 이 방향으로 간다. 같은 수를 연속으로 두지 않게 한다.
5. 더 나아질 여지가 줄었으면(두 회차 연속 최선이 그대로 등) stop=true와 이유를 쓴다.
문으로 막는 것은 넷뿐이다: 증거 날조, 요청 범위 누락, 목적 위반, 안전·법규 위반.
${WRITING}`,

  cardPolish: `[현재 역할: 교열 — 리뷰 카드 다듬기]
MIN이 한 번에 읽고 한마디로 답할 수 있게 다듬는다. 의미를 바꾸지 않는다.
장면으로 시작하는 문장, 은유로 판단을 대신하는 문장, 내부 용어·약어를 고친다. 질문의 날카로움은 내용에 있으므로 수사를 더하지 않는다. 네 줄 합쳐 400자를 넘기지 않는다.
${WRITING}`,

  produce: (copy: boolean) => `[현재 역할: 제작 — 결과물 완성]
브리프를 받은 제작자다. 전략 분석을 다시 하지 않는다. 브리프의 proposition 위에서, output이 요구한 결과물을 MIN이 바로 쓸 수 있게 만든다.
- 문서형: brief.outline의 제목 흐름을 따르되, 더 나은 흐름이 보이면 고친다. 각 절의 첫 문장이 그 절의 요점이다. 측정·검증·리스크는 마지막 절 하나에 짧게 두고, 결과물의 중심을 옮기지 않는다.
- 카피형: 살린 후보(picks)를 sharpen 지시대로 다듬어 쓰임별로 정리한다. 후보마다 헤드와 설명을 붙인다.
- concept는 브리프의 proposition을 결과물의 언어로 다시 쓴 한 줄이다.
- summary는 3줄로 쓴다: 무엇을 만들었나 / 왜 이 방향인가 / 바로 할 일.
${copy ? COPY_WRITING + '\n설명·쓰임·근거 문장에는 아래 규칙을 따른다.\n' : ''}${WRITING}`,

  docTaste: `[현재 역할: MPM — 결과물 심사]
제작된 문서를 MIN의 눈으로 본다. 정합성은 전략 단계에서 이미 봤으니, 여기서는 힘을 본다.
- flowReads: 제목만 이어 읽어도 진단 → 원리 → 해법이 서는가. 문단 첫 문장만 이어 읽어도 논지가 서는가.
- leapScore: 브리프의 도약이 결과물에 살아 있는가.
- 고칠 절만 issues에 제목 그대로 적는다. 고칠 것이 없으면 pass로 한다. 조건·유보를 늘리라는 지적은 하지 않는다.
${WRITING}
${JUDGE_TEXT}`,

  sectionFix: (copy: boolean) => `[현재 역할: 제작 — 부분 수정]
지적받은 절만 다시 쓴다. 다른 절은 출력하지 않는다. originalHeading에는 원래 제목을 그대로 적는다.
${copy ? COPY_WRITING + '\n' : ''}${WRITING}`,

  revise: `[현재 역할: MPM — 결과 개정]
이전 결과에 검증 지시를 반영해 전체 결과를 다시 출력한다. 지시와 무관한 부분은 유지하되, 지시가 다른 부분에 영향을 주면 일관되게 고친다. 최소 3개의 본질적으로 다른 대안 규칙은 그대로 지킨다.
지시를 반영하며 요약(executiveSummary)이 길어지지 않게 한다. 늘어난 세부는 해당 대안에 넣는다.
${WRITING}`
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

const simBlock = (sim?: Simulation) => (sim ? `<simulation>\n${j(sim)}\n</simulation>\n\n` : '')

export function insightUser(canvas: ContextCanvas, tasks: TaskRun[], methods: Method[], sim?: Simulation, factbook?: Factbook): string {
  return `<context_canvas>\n${j(canvas)}\n</context_canvas>\n\n${factbookDigest(factbook)}<audited_insights>\n${insightsDigest(tasks, true)}\n</audited_insights>\n\n${simBlock(sim)}<methods>\n이번 과제에 쓸 방법론: ${methods.map((m) => `${m}(${METHODS[m]})`).join(', ')}\n그 외 방법론 항목은 비워 둔다.\n</methods>\n\nSUPER INSIGHT를 도출하라.`
}

function insightDigest(i?: Insight): string {
  if (!i) return ''
  const extra = [
    i.stp.target.segment && `타깃: ${i.stp.target.segment} — ${i.stp.target.why}`,
    i.stp.positioning.statement && `포지셔닝: ${i.stp.positioning.statement}`,
    i.jtbd.length > 0 && `핵심 JTBD: ${[...i.jtbd].sort((a, b) => b.importance - b.satisfaction - (a.importance - a.satisfaction))[0].motivation}`,
    i.unit.ltvToCac > 0 && `유닛 이코노믹스: LTV/CAC ${i.unit.ltvToCac.toFixed(1)}, 회수 ${i.unit.paybackMonths.toFixed(1)}개월 — ${i.unit.verdict}`,
    i.competition.whitespace && `비어 있는 자리: ${i.competition.whitespace}`
  ].filter(Boolean)
  return `<super_insight>\n4 SUPER STRATEGIES:\n${i.superStrategies.map((s, k) => `${k + 1}. ${s.name} [${s.strength}] (${s.methods}) — ${s.description}`).join('\n')}\n3 KSF:\n${i.ksf.map((s, k) => `${k + 1}. ${s.factor} — ${s.why} [지표: ${s.measure}]`).join('\n')}\n2 CORE KEY-CLAIMS:\n${i.keyClaims.map((s, k) => `${k + 1}. ${s.claim} — ${s.support}`).join('\n')}\n${extra.join('\n')}\n</super_insight>\n\n`
}

export function synthesizeUser(canvas: ContextCanvas, plan: DispatchPlan, tasks: TaskRun[], sim?: Simulation, qa?: QA[], factbook?: Factbook, insight?: Insight): string {
  return `${qaBlock(qa).trim()}\n\n<context_canvas>\n${j(canvas)}\n</context_canvas>\n\n<dispatch_rationale>\n${plan.rationale}\n</dispatch_rationale>\n\n${insightDigest(insight)}${factbookDigest(factbook)}<audited_insights>\n${insightsDigest(tasks, true)}\n</audited_insights>\n\n${simBlock(sim)}최소 3개의 대안으로 종합하라.`
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

export function polishUser(result: unknown, hits: { phrase: string; hint: string; count: number }[]): string {
  const list = hits.slice(0, 25).map((h) => `- "${h.phrase}" ${h.count}회 → ${h.hint}`).join('\n')
  return `<text>\n${j(result)}\n</text>\n\n<ai_phrases_found>\n${list || '(검사기에 걸린 표현 없음 — 두괄식·길이·어미 위주로 다듬는다)'}\n</ai_phrases_found>\n\n위 글의 문장만 MIN의 문체로 고쳐 쓴 전체를 같은 구조로 출력하라.`
}

/* ---------- BRIEF · PRODUCE ---------- */
const canvasForBrief = (c: ContextCanvas) =>
  j({ title: c.title, reframe: c.reframe, goal: c.goal, purpose: c.purpose, core: c.core, deliverable: c.deliverable, why: c.why, competition: c.competition, boundaries: c.boundaries, materials: c.materials.map((m) => ({ source: m.source, summary: m.summary, keyPoints: m.keyPoints })) })

function strategyDigest(s: Synthesis): string {
  const pick = s.alternatives.find((a) => a.id === s.recommendation.pick)
  return `<strategy>\n전략 결론: ${s.executiveSummary}\n\n추천 방향(${s.recommendation.pick}): ${s.recommendation.rationale}\n${pick ? j(pick) : ''}\n\n다른 방향: ${s.alternatives.filter((a) => a.id !== s.recommendation.pick).map((a) => `${a.id}. ${a.name} — ${a.thesis}`).join(' / ')}\n</strategy>`
}

export type RootBlock = { issue: string; test: string; task: string; purpose: string }
export const rootBlock = (r?: RootBlock) =>
  r ? `<root_issue>\n과업: ${r.task}\n목적: ${r.purpose}\n근본 이슈: ${r.issue}\n판정 질문: ${r.test}\n모든 판단과 안은 이 근본 이슈에 대입해 본다.\n</root_issue>` : ''

export function rootUser(brief: string, canvas: ContextCanvas, qa?: QA[]): string {
  return `${qaBlock(qa).trim()}\n\n<brief>\n${brief}\n</brief>\n\n<context_canvas>\n${canvasForBrief(canvas)}\n</context_canvas>\n\n근본 이슈 후보를 세워라.`
}

type RoundLog = { n: number; round: Round; editor: Editor; answer?: { kind: string; text?: string } }
const ANSWER_LABEL: Record<string, string> = { go: '이 질문으로 가자', half: '반만', no: '아니다', stop: '지금 안으로 가자', auto: '(답 없음 — 편집장 방향으로 자동 진행)' }

export function conceptDigest(history: RoundLog[]): string {
  return history
    .map((h) => {
      const q = h.round.questions[h.editor.pickedQuestion]
      return `[${h.n}회차] 지금 안: ${h.round.current.idea}\n걸림: ${h.round.snag}\n수: ${h.round.moves.map((m) => `${MOVES[m.move]}(${m.how}) → ${m.result}${m.keep ? '' : ' [버림]'}`).join(' / ')}\n최선: ${h.round.best.idea} (새로움 ${h.round.best.novelty} · 쓸모 ${h.round.best.use})\n찌르는 질문: ${q?.question ?? '-'}\nMIN의 답: ${h.answer ? `${ANSWER_LABEL[h.answer.kind]}${h.answer.text ? ` — ${h.answer.text}` : ''}` : '-'}\n조각: ${h.round.fragments.join(' / ') || '-'}`
    })
    .join('\n\n')
}

export function painterUser(
  synthesis: Synthesis,
  opts: { n: number; history: RoundLog[]; insight?: Insight; factbook?: Factbook; banMove?: string; steer?: string }
): string {
  const parts = [
    strategyDigest(synthesis),
    insightDigest(opts.insight).trim(),
    opts.n === 1 ? factbookDigest(opts.factbook).trim() : '',
    opts.history.length ? `<previous_rounds>\n${conceptDigest(opts.history)}\n</previous_rounds>` : '',
    opts.steer ? `<direction>\n${opts.steer}\n</direction>` : '',
    opts.banMove ? `지난 회차의 주된 수는 ${opts.banMove}였다. 이번 회차에는 같은 수를 주된 수로 두지 않는다.` : '',
    opts.n === 1 ? '1회차다. 지금 안은 전략의 추천 방향(기본안)이다. 여기서 출발한다.' : `${opts.n}회차다. 지난 회차의 최선과 방향에서 이어 간다. 처음부터 다시 하지 않는다.`
  ]
  return parts.filter(Boolean).join('\n\n')
}

export function editorUser(round: Round, history: RoundLog[]): string {
  return `${history.length ? `<previous_rounds>\n${conceptDigest(history)}\n</previous_rounds>\n\n` : ''}<this_round>\n${j(round)}\n</this_round>\n\n편집장으로서 이번 회차를 정리하고 리뷰 카드를 써라.`
}

export function cardPolishUser(card: ReviewCard): string {
  return `<card>\n${j(card)}\n</card>\n\n같은 네 칸으로 다듬어 출력하라.`
}

export function briefUser(
  canvas: ContextCanvas,
  synthesis: Synthesis,
  opts: { insight?: Insight; factbook?: Factbook; simulation?: Simulation; qa?: QA[]; previous?: Brief; directive?: string; concept?: { history: RoundLog[]; final?: { idea: string; why: string } } }
): string {
  const parts = [
    qaBlock(opts.qa).trim(),
    `<context_canvas>\n${canvasForBrief(canvas)}\n</context_canvas>`,
    strategyDigest(synthesis),
    insightDigest(opts.insight).trim(),
    factbookDigest(opts.factbook).trim(),
    opts.simulation ? `<target_signals>\n${opts.simulation.blindSpots.join('\n')}\n</target_signals>` : '',
    opts.concept?.history.length
      ? `<concept_rounds>\n${conceptDigest(opts.concept.history)}\n\n최종(final): ${opts.concept.final?.idea ?? '-'} — ${opts.concept.final?.why ?? ''}\n</concept_rounds>`
      : ''
  ]
  if (opts.previous) parts.push(`<previous_brief>\n${j(opts.previous)}\n</previous_brief>\n\n<directive>\n${opts.directive}\n</directive>\n\n지시를 반영해 브리프를 다시 써라. 지시가 가리키는 방향으로 과감하게 바꾼다.`)
  else parts.push('1장 브리프를 써라.')
  return parts.filter(Boolean).join('\n\n')
}

export function briefReviewUser(canvas: ContextCanvas, brief: Brief): string {
  return `<request>\n${canvas.reframe.surfaceRequest}\n요청된 결과물: ${canvas.deliverable.output} (${canvas.deliverable.kind})\n</request>\n\n<brief>\n${j(brief)}\n</brief>\n\n이 브리프를 심사하라.`
}

const briefBlock = (b: Brief) => `<brief>\n${j(b)}\n</brief>`

export function divergeUser(brief: Brief, angle: Brief['angles'][number], n: number): string {
  return `${briefBlock(brief)}\n\n<angle>\n${angle.name} — ${angle.direction}\n</angle>\n\n이 각도로 서로 다른 후보 ${n}개를 만들어라.`
}

export function tasteUser(brief: Brief, candidates: { angle: string; head: string; body: string; why: string }[]): string {
  return `${briefBlock(brief)}\n\n<candidates>\n${candidates.map((c, i) => `#${i} [${c.angle}] ${c.head}${c.body ? `\n   ${c.body}` : ''}`).join('\n')}\n</candidates>\n\n모든 후보를 채점하고 살릴 것을 골라라. id는 # 번호다.`
}

export function produceUser(brief: Brief, synthesis: Synthesis, opts: { picks?: string; sharpen?: string; factbook?: Factbook }): string {
  const pick = synthesis.alternatives.find((a) => a.id === synthesis.recommendation.pick)
  const plan = pick ? `<direction>\n${j({ name: pick.name, thesis: pick.thesis, howItWorks: pick.howItWorks, firstSteps: pick.firstSteps, omit: pick.omit, conditions: synthesis.recommendation.conditions })}\n</direction>` : ''
  const picks = opts.picks ? `\n\n<picks>\n${opts.picks}\n</picks>\n\n<sharpen>\n${opts.sharpen ?? ''}\n</sharpen>` : ''
  return `${briefBlock(brief)}\n\n${plan}\n\n${factbookDigest(opts.factbook)}${picks}\n\n결과물을 완성하라.`
}

export function docTasteUser(brief: Brief, deliverable: Deliverable): string {
  return `${briefBlock(brief)}\n\n<deliverable>\n${j(deliverable)}\n</deliverable>\n\n<headings>\n${deliverable.sections.map((x) => x.heading).join('\n')}\n</headings>\n\n이 결과물을 심사하라.`
}

export function sectionFixUser(brief: Brief, deliverable: Deliverable, issues: DocTaste['issues']): string {
  return `${briefBlock(brief)}\n\n<deliverable>\n${j(deliverable)}\n</deliverable>\n\n<fix>\n${issues.map((i) => `- [${i.heading}] ${i.problem} → ${i.fix}`).join('\n')}\n</fix>\n\n지적받은 절만 다시 써라.`
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
