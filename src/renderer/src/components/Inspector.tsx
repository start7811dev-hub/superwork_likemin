import type { ReactNode } from 'react'
import { METHODS, type Factbook, type Judgment, type ProcessPlan, type Review, type WorkerReport } from '@shared/schemas'
import { estimateCost, type RunRecord } from '@shared/types'
import type { LiveState } from '../live'

const KIND: Record<string, string> = { fact: '사실', inference: '추론', hypothesis: '가설', opinion: '의견' }
const LV: Record<string, string> = { high: '높음', medium: '중간', low: '낮음' }
const ISSUE: Record<string, string> = {
  misclassified: '분류 오류',
  unsupported: '근거 없음',
  optimistic: '낙관',
  logic_gap: '논리 비약',
  off_core: '코어 이탈',
  missing: '누락',
  min_check: 'MIN 체크'
}

const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="ins-sec">
    <h4>{title}</h4>
    {children}
  </section>
)
const Ul = ({ items }: { items: string[] }) =>
  items.length ? <ul>{items.map((i, k) => <li key={k}>{i}</li>)}</ul> : <p className="muted">없음</p>

/** MPM의 공정 설계: 무엇을 돌리고 무엇을 왜 생략했는가 */
function ProcessView({ p }: { p: ProcessPlan }) {
  const SCALE = { focused: '집중', standard: '표준', full: '전체' }
  const row = (k: string, on: boolean, v: string, reason: string) => (
    <li key={k}>
      <span className={`tag ${on ? 'ok' : ''}`}>{k}</span> {v}
      <div className="small muted">{reason}</div>
    </li>
  )
  return (
    <section className="ins-sec">
      <h4>공정 설계 · {SCALE[p.scale]}</h4>
      <p>{p.rationale}</p>
      {p.givenContext && <p className="small"><b>주어진 전제</b> {p.givenContext}</p>}
      <ul className="proc">
        {row('담당', true, `${p.maxTasks}명`, '')}
        {row('Factbook', p.factbook.mode !== 'skip', p.factbook.mode === 'full' ? '전원 조사' : p.factbook.mode === 'light' ? '일부 조사' : '생략', p.factbook.reason)}
        {row('시뮬레이션', p.simulate.run, p.simulate.run ? '실행' : '생략', p.simulate.reason)}
        {row('방법론', p.methods.length > 0, p.methods.length ? p.methods.map((m) => METHODS[m]).join(' · ') : '생략', p.methodsReason)}
        {row('고도화', p.refine.run, p.refine.run ? '실행' : '생략', p.refine.reason)}
        {row('MPM 클론', p.clone.run, p.clone.run ? '실행' : '생략', p.clone.reason)}
      </ul>
    </section>
  )
}

/** 판단 엔진 기록: 근거 문서 → 적용 → 판단 */
function JudgmentView({ j }: { j: Judgment }) {
  return (
    <section className="ins-sec judgment">
      <h4>판단 엔진 · 확신 {LV[j.confidence]}</h4>
      <p><b>{j.decision}</b></p>
      <ul>
        {j.basis.map((b, i) => (
          <li key={i}>
            <span className="tag">{b.source}</span> {b.principle}
            <div className="small muted">→ {b.application}</div>
          </li>
        ))}
      </ul>
      <p className="small"><b>반대 검토</b> {j.counterCheck}</p>
    </section>
  )
}

function ReviewView({ r, title }: { r: Review; title: string }) {
  return (
    <>
      <Sec title={`${title} — ${r.verdict === 'improve' ? `개선 ${r.issues.length}건` : '수정 없이 유지'}`}>
        {r.strengths.length > 0 && <p className="small muted">좋은 점: {r.strengths.join(' · ')}</p>}
        <ul>{r.issues.map((i, k) => <li key={k}><span className="tag">{i.target}</span> {i.problem}<div className="small">→ {i.fix}</div></li>)}</ul>
      </Sec>
      <JudgmentView j={r.judgment} />
    </>
  )
}

function FactbookMini({ f }: { f: Factbook }) {
  return (
    <Sec title={`Factbook — 사실 ${f.facts.length} · 데이터 ${f.datasets.length} · 제품 ${f.products.length} · 경쟁사 ${f.competitors.length}`}>
      <ul>{f.facts.slice(0, 6).map((x, i) => <li key={i}>{x.statement} <span className="small muted">({x.source}{x.date ? `, ${x.date}` : ''})</span></li>)}</ul>
      {f.gaps.length > 0 && <p className="small muted">확인 못 한 것: {f.gaps.join(' · ')}</p>}
    </Sec>
  )
}

function Findings({ report }: { report: WorkerReport }) {
  return (
    <ul className="findings">
      {report.findings.map((f, i) => (
        <li key={i}>
          <span className={`tag k-${f.kind}`}>{KIND[f.kind]}</span>
          <span className="muted small">{LV[f.confidence]}</span>
          <div>{f.claim}</div>
          {f.source && <div className="small muted">출처: {f.source}</div>}
        </li>
      ))}
    </ul>
  )
}

function Body({ id, r }: { id: string; r: RunRecord }) {
  if (id === 'inbox')
    return (
      <>
        <Sec title="MIN의 지시"><p className="pre">{r.brief}</p></Sec>
        {r.materials?.length ? (
          <Sec title={`참고 자료 ${r.materials.length}건`}>
            <ul className="proc">{r.materials.map((m, i) => <li key={i}><span className="tag">{m.kind === 'pdf' ? 'PDF' : m.kind === 'image' ? '이미지' : '텍스트'}</span> {m.source}{m.note && <div className="small muted">{m.note}</div>}</li>)}</ul>
          </Sec>
        ) : null}
        {r.materialErrors?.length ? <Sec title="읽지 못한 자료"><Ul items={r.materialErrors} /></Sec> : null}
        {r.canvas?.materials.length ? (
          <Sec title="MPM의 자료 요약">
            <ul className="proc">{r.canvas.materials.map((m, i) => <li key={i}><b>{m.source}</b> — {m.summary}<div className="small muted">쓰임: {m.useFor}</div></li>)}</ul>
          </Sec>
        ) : null}
      </>
    )

  if (id === 'intake') {
    const c = r.canvas
    if (!c) return <p className="muted">맥락을 설계하는 중입니다…</p>
    return (
      <>
        <Sec title="허물고 다시 세우기">
          <p><b>표면 요청</b> {c.reframe.surfaceRequest}</p>
          <p><b>실제 문제</b> {c.reframe.realProblem}</p>
          <Ul items={c.reframe.questionedPremises} />
        </Sec>
        <JudgmentView j={c.judgment} />
        <ProcessView p={c.process} />
        <Sec title="핵심 주장 가설"><Ul items={c.initialClaims} /></Sec>
        <Sec title={c.intent.clear ? '의도 — 파악 완료, 확인 없이 진행' : '의도 — 불분명해서 비유로 질문함'}>
          <p>{c.intent.reading}</p>
        </Sec>
        {r.answers?.length ? (
          <Sec title="MIN의 답변">
            <ul>{r.answers.map((x, i) => <li key={i}><b>{x.question}</b><div>{x.answer}</div></li>)}</ul>
          </Sec>
        ) : null}
        <Sec title="왜 하는가">
          <p>{c.why.influencePath}</p>
          {c.why.warning && <p className="small" style={{ color: 'var(--bad)' }}>⚠ {c.why.warning}</p>}
        </Sec>
        <Sec title="비용">
          <p>{c.cost.known}</p>
          <Ul items={c.cost.toVerify.map((x) => `확인 필요: ${x}`)} />
        </Sec>
        <Sec title="경쟁 · 차별화">
          <p>{c.competition.landscape}</p>
          <p><b>의미 있는 차이</b> {c.competition.meaningfulDifference}</p>
        </Sec>
        <Sec title="목표 · 목적">
          <p><b>목표</b> {c.goal}</p>
          <p><b>목적</b> {c.purpose}</p>
        </Sec>
        <Sec title="코어">
          <p><b>브랜드</b> {c.core.brand}</p>
          <p><b>소비자</b> {c.core.consumer}</p>
          <p><b>시장</b> {c.core.market}</p>
        </Sec>
        <Sec title="판단 기준 (우선순위)">
          <ol>{[...c.criteria].sort((a, b) => a.priority - b.priority).map((k, i) => <li key={i}>{k.criterion}</li>)}</ol>
        </Sec>
        <Sec title="가정 (검증 필요)">
          <ul>{c.assumptions.map((a, i) => <li key={i}><span className={`tag r-${a.risk}`}>{LV[a.risk]}</span> {a.statement}<div className="small muted">검증: {a.howToVerify}</div></li>)}</ul>
        </Sec>
        <Sec title="MIN에게 확인할 질문"><Ul items={c.clarifyingQuestions} /></Sec>
      </>
    )
  }

  if (id === 'dispatch') {
    if (!r.plan) return <p className="muted">업무를 분장하는 중입니다…</p>
    return (
      <>
        <Sec title="분장 의도"><p>{r.plan.rationale}</p></Sec>
        <JudgmentView j={r.plan.judgment} />
        {r.plan.tasks.map((t) => (
          <Sec key={t.id} title={`${t.id} · ${t.title}`}>
            <dl className="contract">
              <dt>목적</dt><dd>{t.contract.objective}</dd>
              <dt>책임</dt><dd>{t.contract.responsibility}</dd>
              <dt>기준</dt><dd>{t.contract.criteria}</dd>
              <dt>경계</dt><dd>{t.contract.boundaries}</dd>
              <dt>출력</dt><dd>{t.contract.deliverable}</dd>
            </dl>
            <div className="small muted">담당: {t.roleId} · 위임: <b>{t.tier === 'mpm' ? '최상위 모델' : t.tier === 'light' ? '경량 모델' : '작업 모델'}</b> — {t.tierReason}</div>
          </Sec>
        ))}
      </>
    )
  }

  if (id.startsWith('worker:')) {
    const t = r.tasks[id.slice(7)]
    if (!t) return <p className="muted">대기 중</p>
    return (
      <>
        <Sec title="업무 계약">
          <dl className="contract">
            <dt>목적</dt><dd>{t.task.contract.objective}</dd>
            <dt>책임</dt><dd>{t.task.contract.responsibility}</dd>
            <dt>경계</dt><dd>{t.task.contract.boundaries}</dd>
          </dl>
        </Sec>
        <p className="small muted">위임 모델: {t.model ?? '-'} ({t.task.tier}) — {t.task.tierReason}</p>
        {t.factbook && <FactbookMini f={t.factbook} />}
        {!t.rounds.length && <p className="muted">작업 중입니다…</p>}
        {t.rounds.map((round, i) => (
          <Sec key={i} title={`라운드 ${i + 1}${round.audit ? ` — ${round.audit.verdict === 'approve' ? '승인' : '반려'} · 신뢰도 ${round.audit.trustScore}` : ' — 검수 대기'}`}>
            <p>{round.report.summary}</p>
            <Findings report={round.report} />
            {round.audit && round.audit.issues.length > 0 && (
              <div className="issues">
                <h5>MPM 검수 지적</h5>
                <ul>{round.audit.issues.map((x, k) => <li key={k}><span className={`tag r-${x.severity}`}>{ISSUE[x.type] ?? x.type}</span> <b>{x.target}</b> — {x.problem}</li>)}</ul>
                {round.audit.reworkInstruction && <p className="small"><b>재작업 지시</b> {round.audit.reworkInstruction}</p>}
              </div>
            )}
            {round.research && <details className="small"><summary>웹 리서치 메모</summary><p className="pre">{round.research}</p></details>}
          </Sec>
        ))}
      </>
    )
  }

  if (id === 'audit') {
    const rows = Object.values(r.tasks).flatMap((t) => t.rounds.map((x, i) => ({ t, x, i })).filter((v) => v.x.audit))
    if (!rows.length) return <p className="muted">검수 대기 중</p>
    return (
      <Sec title="검수 기록">
        <ul className="audit-list">
          {rows.map(({ t, x, i }) => (
            <li key={`${t.task.id}-${i}`}>
              <span className={`tag ${x.audit!.verdict === 'approve' ? 'ok' : 'bad'}`}>{x.audit!.verdict === 'approve' ? '승인' : '반려'}</span>
              <b>{t.task.title}</b> R{i + 1} · 신뢰도 {x.audit!.trustScore} · 지적 {x.audit!.issues.length}
            </li>
          ))}
        </ul>
      </Sec>
    )
  }

  if (id === 'factbook') return r.factbook ? <FactbookMini f={r.factbook} /> : <p className="muted">하위 담당들의 Factbook을 기다리는 중</p>

  if (id === 'insight') {
    const i = r.insight
    if (!i) return <p className="muted">시뮬레이션 이후 AARRR · TOWS · STP · CDJ로 분석합니다</p>
    return (
      <>
        <Sec title="2 CORE KEY-CLAIMS"><ol>{i.keyClaims.map((c, k) => <li key={k}><b>{c.claim}</b><div className="small muted">{c.support}</div></li>)}</ol></Sec>
        <Sec title="3 KEY SUCCESS FACTORS"><ol>{i.ksf.map((c, k) => <li key={k}>{c.factor} <span className="small muted">({c.measure})</span></li>)}</ol></Sec>
        <Sec title="4 SUPER STRATEGIES"><ol>{i.superStrategies.map((c, k) => <li key={k}>{c.name} <span className="tag">{c.methods}</span></li>)}</ol></Sec>
        <JudgmentView j={i.judgment} />
      </>
    )
  }

  if (id === 'review') return r.verification?.review ? <ReviewView r={r.verification.review} title="재검증" /> : <p className="muted">결과가 나오면 다시 고민합니다</p>
  if (id === 'refine') return r.verification?.refine ? <ReviewView r={r.verification.refine} title="고도화" /> : <p className="muted">재검증 이후 디테일을 다듬습니다</p>
  if (id === 'brief') {
    const b = r.workBrief
    if (!b) return <p className="muted">전략이 끝나면 MPM이 결과물을 위한 1장 브리프를 씁니다</p>
    return (
      <>
        <Sec title="제안 한 줄"><p><b>{b.proposition}</b></p></Sec>
        <Sec title="통찰"><p>{b.insight.truth}</p><p className="small muted">긴장: {b.insight.tension}</p></Sec>
        <Sec title="도약"><p>{b.leap}</p></Sec>
        <Sec title="버릴 것"><Ul items={b.notThis} /></Sec>
        <Sec title="만들 것"><p>{b.output}</p><p className="small muted">{b.format}</p></Sec>
        {r.briefNote && <Sec title="MIN의 지시"><p>{r.briefNote}</p></Sec>}
        <JudgmentView j={b.judgment} />
      </>
    )
  }
  if (id === 'produce' || id === 'taste') {
    const pd = r.production
    if (!pd) return <p className="muted">브리프가 승인되면 결과물 유형에 맞게 제작합니다</p>
    if (pd.candidates) {
      const picked = new Map(pd.taste?.picks.map((p) => [p.id, p.why]) ?? [])
      return (
        <>
          {pd.taste && <Sec title="버린 이유"><Ul items={pd.taste.killedPatterns} /></Sec>}
          {pd.taste && <Sec title="다듬는 방향"><p>{pd.taste.sharpen}</p></Sec>}
          <Sec title={`후보 ${pd.candidates.length}개${pd.taste ? ` · 채택 ${pd.taste.picks.length}` : ''}`}>
            <ol className="cands">{pd.candidates.map((c, i) => <li key={i} className={picked.has(i) ? 'picked' : ''}><span>{c.head}</span> <span className="muted small">{c.angle}</span></li>)}</ol>
          </Sec>
        </>
      )
    }
    const dt = pd.docTaste
    return (
      <>
        {r.deliverable && <Sec title="제목 흐름"><ol>{r.deliverable.sections.map((x, i) => <li key={i}>{x.heading}</li>)}</ol></Sec>}
        {dt && <Sec title={`결과물 심사 · 도약 ${dt.leapScore}/5`}><ul>{dt.issues.map((x, i) => <li key={i}><b>{x.heading}</b> {x.problem} → {x.fix}</li>)}</ul></Sec>}
      </>
    )
  }
  if (id === 'clone' && r.briefReview) {
    const c = r.briefReview
    return (
      <>
        <Sec title="클론의 브리프 심사"><p><b>{c.insight}</b></p></Sec>
        <Sec title="판정"><p>도약 {c.leapScore}/5 · {c.generic ? '경쟁사 브리프에도 들어갈 말' : '고유함'} · {c.scopeMatch ? '요청과 같은 결과물' : '요청과 다른 결과물'}</p></Sec>
        {c.verdict === 'rewrite' && <Sec title="직권 지시"><p>{c.directive}</p></Sec>}
        <JudgmentView j={c.judgment} />
      </>
    )
  }
  if (id === 'clone') {
    const c = r.verification?.clone
    if (!c) return <p className="muted">브리프가 나오면 MPM 클론이 거시 관점에서 심사합니다</p>
    return (
      <>
        <Sec title="클론의 통찰"><p><b>{c.insight}</b></p></Sec>
        <Sec title="거시 통합 검증">
          <p><b>의도·목적</b> {c.macro.intentPurpose}</p>
          <p><b>타깃·브랜드</b> {c.macro.targetBrand}</p>
          <p><b>시장</b> {c.macro.market}</p>
          <p><b>통합</b> {c.macro.integration}</p>
        </Sec>
        {c.bigIssue && <Sec title="직권 지시"><p>{c.directive}</p></Sec>}
        <JudgmentView j={c.judgment} />
      </>
    )
  }

  if (id === 'simulate') {
    const s = r.simulation
    if (!s) return <p className="muted">시뮬레이션 대기 중</p>
    return (
      <>
        {s.personas.map((p, i) => (
          <Sec key={i} title={p.name}>
            <p className="small muted">{p.situation} · 렌즈: {p.lens}</p>
            <p>{p.predictedBehavior}</p>
            <p className="small"><b>메커니즘</b> {p.mechanism}</p>
            <p className="small"><b>관찰 신호</b> {p.signal}</p>
          </Sec>
        ))}
        <Sec title="놓친 지점"><Ul items={s.blindSpots} /></Sec>
      </>
    )
  }

  if (id === 'deliver' && r.deliverable) {
    const d = r.deliverable
    return (
      <>
        <Sec title={d.title}><p>{d.summary}</p></Sec>
        {d.concept && <Sec title="콘셉트"><p><b>{d.concept}</b></p></Sec>}
        <Sec title="구성"><ol>{d.sections.map((x, i) => <li key={i}>{x.heading}</li>)}</ol></Sec>
        {r.verification?.polish && <Sec title="윤문"><p>AI투 표현 {r.verification.polish.before}개 → {r.verification.polish.after}개</p></Sec>}
      </>
    )
  }
  if (id === 'synthesize' || id === 'deliver') {
    const s = r.synthesis
    if (!s) return <p className="muted">종합 대기 중</p>
    return (
      <>
        <Sec title="요약"><p>{s.executiveSummary}</p></Sec>
        <Sec title={`대안 ${s.alternatives.length}개`}>
          <ul>{s.alternatives.map((a) => <li key={a.id}><b>{a.id}. {a.name}</b> <span className="muted small">{a.archetype}</span></li>)}</ul>
        </Sec>
        <Sec title={`조건부 추천: ${s.recommendation.pick}`}><p>{s.recommendation.rationale}</p></Sec>
      </>
    )
  }
  return null
}

const TITLES: Record<string, string> = {
  inbox: '업무 지시',
  intake: 'MPM · 맥락 캔버스',
  dispatch: 'MPM · 업무 분장',
  audit: 'MPM · 검수 게이트',
  simulate: '타깃 시뮬레이터',
  factbook: 'Factbook 도서관',
  insight: 'SUPER INSIGHT 연구소',
  review: 'MPM · 재검증',
  refine: 'MPM · 최종 검증 A (고도화)',
  clone: 'MPM 클론 · 브리프 심사',
  synthesize: 'MPM · 전략 종합',
  brief: 'MPM · 1장 브리프',
  produce: '제작 스튜디오',
  taste: 'MPM · 취향 심사',
  deliver: '최종 결과물'
}

export default function Inspector({ live, selected }: { live: LiveState; selected: string | null }) {
  const r = live.record
  const id = selected ?? 'intake'
  const title = id.startsWith('worker:') ? r?.tasks[id.slice(7)]?.task.title ?? '하위 담당' : TITLES[id]
  const log = r?.log ?? []
  return (
    <aside className="inspector">
      <div className="ins-head">
        <div className="eyebrow">INSPECTOR</div>
        <h3>{title}</h3>
      </div>
      <div className="ins-body">{live.nodes[id]?.status === 'skipped' ? <Sec title="MPM이 이 단계를 생략했습니다"><p>{live.nodes[id]?.detail?.replace(/^생략 · /, '')}</p></Sec> : r ? <Body id={id} r={r} /> : <p className="muted">공정의 스테이션을 클릭하면 각 담당의 계약·보고·검수 내역을 볼 수 있습니다.</p>}</div>
      <div className="ins-log">
        <div className="log-head">
          <span>공정 로그</span>
          <span className="muted">${estimateCost(live.usage).toFixed(3)}</span>
        </div>
        <ul>
          {log.slice(-40).reverse().map((l, i) => (
            <li key={i} className={`lv-${l.level}`}>
              <time>{new Date(l.at).toLocaleTimeString('ko-KR', { hour12: false })}</time> {l.text}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
