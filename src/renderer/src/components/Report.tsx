import { useEffect, useRef, useState } from 'react'
import { estimateCost, type ExportFormat, type IntegrationInfo, type RunRecord } from '@shared/types'
import { DELIVERABLE_KINDS, type Brief } from '@shared/schemas'
import { deliverableOf } from '@shared/report-md'
import { api } from '../api'
import FactbookView from './FactbookView'
import Md from './Md'
import StrategyViz, { Pyramid432 } from './StrategyViz'
import { RoundsTrail } from './Inspector'

const LV: Record<string, string> = { high: '높음', medium: '중간', low: '낮음' }

function Dots({ n }: { n: number }) {
  return (
    <span className="dots" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= Math.round(n) ? 'on' : ''} />)}
    </span>
  )
}

/** 1장 브리프: 표 대신 정의 목록으로 */
export function BriefCard({ b }: { b: Brief }) {
  const rows: [string, string][] = [
    ['만들 것', b.output],
    ['받는 사람', b.audience],
    ['통찰', b.insight.truth],
    ['긴장', b.insight.tension],
    ['도약', b.leap],
    ['버릴 것', b.notThis.join(' · ')],
    ['근거', b.evidence.map((e) => `${e.point} (${e.source})`).join(' · ')],
    ['톤 · 형식', `${b.tone} · ${b.format}`],
    ['반드시', b.must.join(' · ')],
    ['절대', b.mustNot.join(' · ')],
    ['합격선', b.bar]
  ]
  return (
    <div className="brief-card">
      <div className="eyebrow">1장 브리프 · {DELIVERABLE_KINDS[b.kind]}</div>
      <p className="brief-prop">{b.proposition}</p>
      <dl className="brief-dl">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
        {b.angles.length > 0 && <div><dt>탐색 각도</dt><dd>{b.angles.map((a) => a.name).join(' · ')}</dd></div>}
        {b.outline.length > 0 && <div><dt>제목 흐름</dt><dd><ol>{b.outline.map((o, i) => <li key={i}>{o.heading}</li>)}</ol></dd></div>}
      </dl>
    </div>
  )
}

export default function Report({ run, onToast }: { run: RunRecord; onToast(msg: string): void }) {
  const s = run.synthesis
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([])
  const [chosen, setChosen] = useState(run.feedback?.chosen ?? '')
  const [note, setNote] = useState(run.feedback?.note ?? '')
  const [busy, setBusy] = useState('')
  const [tab, setTab] = useState<'report' | 'insight' | 'factbook' | 'verify'>('report')
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    top.current?.scrollTo({ top: 0 })
  }, [tab, run.id])

  useEffect(() => {
    void api.integrations.list().then(setIntegrations)
  }, [])
  useEffect(() => {
    setChosen(run.feedback?.chosen ?? '')
    setNote(run.feedback?.note ?? '')
  }, [run.id, run.feedback])

  if (!s) {
    return (
      <div className="report empty">
        <p>{run.status === 'running' ? '공정이 진행 중입니다. 종합이 끝나면 리포트가 표시됩니다.' : run.error ?? '리포트가 없습니다.'}</p>
      </div>
    )
  }

  const doExport = async (f: ExportFormat) => {
    const res = await api.exporter.save(run.id, f)
    if (res.ok) onToast(`저장됨: ${res.path}`)
  }
  const copy = async () => {
    await navigator.clipboard.writeText(await api.exporter.markdown(run.id))
    onToast('마크다운을 클립보드에 복사했습니다.')
  }
  const share = async (id: string) => {
    setBusy(id)
    const res = await api.integrations.send(id, run.id)
    setBusy('')
    onToast(res.message + (res.url ? ` ${res.url}` : ''))
  }
  const saveFeedback = async () => {
    await api.runs.feedback(run.id, chosen, note)
    onToast('MIN의 결정을 두뇌 메모리에 기록했습니다. 다음 업무부터 참고합니다.')
  }

  const ids = s.alternatives.map((a) => a.id)
  const d = deliverableOf(run)

  return (
    <div className="report" ref={top}>
      <div className="report-bar">
        <div className="group">
          <span className="eyebrow">내보내기</span>
          {(['pdf', 'md', 'html', 'json'] as ExportFormat[]).map((f) => (
            <button key={f} className="chip" onClick={() => doExport(f)}>{f.toUpperCase()}</button>
          ))}
          {run.factbook && <button className="chip" onClick={() => doExport('factbook')}>Factbook</button>}
          <button className="chip" disabled={busy === 'pptx' || run.demo} title={run.demo ? '데모 실행은 PPT로 만들 수 없습니다' : 'Claude의 PPTX 스킬로 보고용 덱을 만듭니다 (1~3분, API 비용 발생)'} onClick={async () => {
            setBusy('pptx')
            onToast('PPT 덱을 만드는 중입니다… (1~3분)')
            try {
              const res = await api.exporter.save(run.id, 'pptx')
              if (res.ok) onToast(`저장됨: ${res.path}`)
            } catch (e) {
              onToast(`PPT 생성 실패: ${(e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`)
            } finally {
              setBusy('')
            }
          }}>{busy === 'pptx' ? 'PPT 생성 중…' : 'PPT'}</button>
          <button className="chip" onClick={copy}>복사</button>
        </div>
        <div className="group">
          <span className="eyebrow">공유</span>
          {integrations.map((i) => (
            <button key={i.id} className="chip" disabled={busy === i.id} onClick={() => share(i.id)} title={i.description}>
              {busy === i.id ? '전송 중…' : i.name}
            </button>
          ))}
        </div>
      </div>

      <nav className="doc-tabs">
        <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>리포트</button>
        <button className={tab === 'insight' ? 'on' : ''} onClick={() => setTab('insight')} disabled={!run.insight}>SUPER INSIGHT</button>
        <button className={tab === 'factbook' ? 'on' : ''} onClick={() => setTab('factbook')} disabled={!run.factbook}>Factbook</button>
        <button className={tab === 'verify' ? 'on' : ''} onClick={() => setTab('verify')}>검증 기록 {run.verification ? `(${run.verification.versions.length})` : ''}</button>
      </nav>

      {tab === 'insight' && run.insight && (
        <article className="doc">
          <div className="eyebrow">SUPER INSIGHT · 대안을 내기 전에 찍고 가는 4-3-2</div>
          <h1>{run.title}</h1>
          <StrategyViz insight={run.insight} />
        </article>
      )}

      {tab === 'factbook' && run.factbook && (
        <article className="doc">
          <div className="eyebrow">FACTBOOK</div>
          <h1>{run.title}</h1>
          <FactbookView f={run.factbook} />
        </article>
      )}

      {tab === 'verify' && (
        <article className="doc">
          <div className="eyebrow">성미 급한 MPM의 검증 이력</div>
          <h1>전략 → 재검증 → 콘셉트 회차 → 브리프 → 제작 → 취향 심사</h1>
          <ul className="vtrail">
            {run.verification?.versions.map((v, i) => <li key={i}><b>v{i + 1} · {v.label}</b> <span className="muted small">{new Date(v.at).toLocaleTimeString('ko-KR')}</span></li>)}
          </ul>
          {run.verification?.review && (
            <section><h2>재검증 — {run.verification.review.verdict === 'improve' ? '개선' : '유지'}</h2>
              <ul>{run.verification.review.issues.map((x, i) => <li key={i}><b>{x.target}</b> {x.problem} → {x.fix}</li>)}</ul></section>
          )}
          {run.verification?.refine && (
            <section><h2>최종 검증 A · 고도화 — {run.verification.refine.verdict === 'improve' ? '개선' : '유지'}</h2>
              <ul>{run.verification.refine.issues.map((x, i) => <li key={i}><b>{x.target}</b> {x.problem} → {x.fix}</li>)}</ul></section>
          )}
          {run.verification?.clone && (
            <section className="rec"><div className="eyebrow">최종 검증 B · MPM 클론</div>
              <h2>{run.verification.clone.insight}</h2>
              <p>의도·목적: {run.verification.clone.macro.intentPurpose}</p>
              <p>타깃·브랜드: {run.verification.clone.macro.targetBrand}</p>
              <p>시장: {run.verification.clone.macro.market}</p>
              {run.verification.clone.bigIssue && <p><b>직권 지시</b> {run.verification.clone.directive}</p>}
            </section>
          )}
          {run.briefReview && (
            <section><h2>MPM 클론의 브리프 심사 — {run.briefReview.verdict === 'rewrite' ? '직권 지시' : '통과'}</h2>
              <p>{run.briefReview.insight}</p>
              <p className="muted small">도약 {run.briefReview.leapScore}/5 · {run.briefReview.generic ? '뻔함' : '고유함'} · {run.briefReview.scopeMatch ? '요청과 일치' : '요청과 다름'}</p>
              {run.briefReview.verdict === 'rewrite' && <p><b>직권 지시</b> {run.briefReview.directive}</p>}
              {run.briefNote && <p><b>MIN의 지시</b> {run.briefNote}</p>}
            </section>
          )}
          {run.production?.taste && run.production.candidates && (
            <section><h2>취향 심사 — 후보 {run.production.candidates.length}개 중 {run.production.taste.picks.length}개 채택</h2>
              <p className="muted">버린 이유: {run.production.taste.killedPatterns.join(' · ')}</p>
              {run.production.taste.rescue?.length ? <p className="muted">살린 조각: {run.production.taste.rescue.map((x) => `${run.production!.candidates![x.id]?.head ?? ''} — ${x.how}`).join(' · ')}</p> : null}
              <ol className="cands">
                {run.production.candidates.map((c, i) => {
                  const pick = run.production!.taste!.picks.find((p) => p.id === i)
                  return <li key={i} className={pick ? 'picked' : ''}><span>{c.head}</span> <span className="muted small">{c.angle}{pick ? ` · 채택: ${pick.why}` : ''}</span></li>
                })}
              </ol>
            </section>
          )}
          {run.production?.docTaste && (
            <section><h2>결과물 심사 — {run.production.docTaste.verdict === 'fix' ? `${run.production.fixed?.length ?? 0}개 절 수정` : '통과'}</h2>
              <p className="muted small">제목 흐름 {run.production.docTaste.flowReads ? '통과' : '끊김'} · 도약 {run.production.docTaste.leapScore}/5</p>
              <ul>{run.production.docTaste.issues.map((x, i) => <li key={i}><b>{x.heading}</b> {x.problem} → {x.fix}</li>)}</ul>
            </section>
          )}
          {run.verification?.polish && (
            <section><h2>윤문 — AI투 표현 {run.verification.polish.before}개 → {run.verification.polish.after}개</h2>
              {run.verification.polish.top.length > 0 && <p className="muted">많았던 말: {run.verification.polish.top.map((h) => `${h.phrase} ${h.count}`).join(' · ')}</p>}
            </section>
          )}
        </article>
      )}

      {tab === 'report' && (
      <article className="doc">
        <header>
          <div className="eyebrow">REPORT · {new Date(run.createdAt).toLocaleString('ko-KR')} · ${estimateCost(run.usage).toFixed(2)}{run.verification?.versions.length ? ` · ${run.verification.versions.at(-1)!.label}` : ''}</div>
          <h1>{d?.title || run.title}</h1>
          <div className="lead"><Md text={d?.summary || s.executiveSummary} /></div>
        </header>

        {d && (
          <section className="deliverable">
            {d.concept && <p className="concept">{d.concept}</p>}
            {d.sections.map((sec, i) => (
              <div key={i} className="dl-sec">
                <h3>{sec.heading}</h3>
                <Md text={sec.body} />
              </div>
            ))}
          </section>
        )}

        {run.rootIssue && (
          <section className="root-sec">
            <div className="eyebrow">근본 이슈 · {run.rootIssue.by === 'min' ? 'MIN 확정' : 'MPM 추천'}</div>
            <p className="brief-prop">{run.rootIssue.issue}</p>
            <p className="muted">판정 질문: {run.rootIssue.test}</p>
          </section>
        )}

        {run.concept?.rounds.length ? (
          <section>
            <h2>콘셉트 회차 — {run.concept.rounds.length}회차{run.concept.stoppedBy ? ` · ${run.concept.stoppedBy}` : ''}</h2>
            <RoundsTrail run={run} />
          </section>
        ) : null}

        {run.workBrief && <BriefCard b={run.workBrief} />}

        <div className="part-divider"><span className="eyebrow">전략 근거</span></div>
        {d?.summary && (
          <section>
            <h2>전략 결론</h2>
            <Md text={s.executiveSummary} />
          </section>
        )}

        <section className="core-grid">
          {([['목표', s.coreRestated.goal], ['목적', s.coreRestated.purpose], ['브랜드', s.coreRestated.brand], ['소비자', s.coreRestated.consumer], ['시장', s.coreRestated.market]] as const).map(([k, v]) => (
            <div key={k} className="core-cell">
              <span className="eyebrow">{k}</span>
              <p>{v}</p>
            </div>
          ))}
        </section>

        {run.answers?.length ? (
          <section className="qa">
            <div className="eyebrow">MPM의 질문과 MIN의 답</div>
            <ul>{run.answers.map((x, i) => <li key={i}><b>{x.question}</b> — {x.answer}</li>)}</ul>
          </section>
        ) : null}

        <section className="rec">
          <div className="eyebrow">조건부 추천</div>
          <h2>{s.recommendation.pick}. {s.alternatives.find((a) => a.id === s.recommendation.pick)?.name}</h2>
          <Md text={s.recommendation.rationale} />
          <div className="rec-grid">
            <div><h5>유효 조건</h5><ul>{s.recommendation.conditions.map((c, i) => <li key={i}><Md text={c} inline /></li>)}</ul></div>
            <div><h5>전환 계획</h5><Md text={s.recommendation.switchTo} /></div>
          </div>
        </section>

        {run.insight && (
          <section className="insight-sum">
            <div className="eyebrow">SUPER INSIGHT · MIN'S 4-3-2 THINKING</div>
            <Pyramid432 insight={run.insight} compact />
            <button className="link-btn" onClick={() => setTab('insight')}>AARRR · TOWS · STP · CDJ 시각화 보기 →</button>
          </section>
        )}

        <section className="alts">
          {s.alternatives.map((a) => (
            <div key={a.id} className={`alt ${a.id === s.recommendation.pick ? 'picked' : ''}`}>
              <div className="alt-head">
                <span className="alt-id">{a.id}</span>
                <div>
                  <h3>{a.name}</h3>
                  <span className="tag">{a.archetype}</span>
                </div>
              </div>
              <div className="thesis"><Md text={a.thesis} /></div>
              <div className="fit">
                <span>목표 <Dots n={a.goalFit} /></span>
                <span>목적 <Dots n={a.purposeFit} /></span>
                <span>가역성 {LV[a.reversibility]}</span>
                <span>확신 {LV[a.confidence]}</span>
              </div>
              <ol className="how">{a.howItWorks.map((h, i) => <li key={i}><Md text={h} inline /></li>)}</ol>
              <div className="cost">
                <b>비용</b> {a.cost.estimate}
                {a.cost.needsVerification.length > 0 && <div className="small">확인 필요: {a.cost.needsVerification.join(' · ')}</div>}
                {a.cost.valueShiftsWhen.length > 0 && <div className="small muted">가치 판단이 바뀌는 상황: {a.cost.valueShiftsWhen.join(' · ')}</div>}
              </div>
              <div className="axes">
                <div><b>왜 · 영향력 확산</b>{a.influencePath}</div>
                <div><b>차별화</b>{a.differentiation}</div>
                <div><b>유지할 관성 → 혁신</b>{a.keepInertia} → {a.innovation}</div>
                <div><b>첫인상 / 반복 사용</b>{a.firstImpression} / {a.repeatUse}</div>
                {a.omit.length > 0 && <div><b>빼는 것 (불편보다 없는 게 낫다)</b>{a.omit.join(' · ')}</div>}
              </div>
              <div className="axes">
                <div><b>브랜드</b>{a.brandImpact}</div>
                <div><b>소비자</b>{a.consumerImpact}</div>
                <div><b>시장</b>{a.marketImpact}</div>
              </div>
              <details>
                <summary>트레이드오프 · 엣지 케이스 · 리스크 · 철회 조건</summary>
                <h5>비용 내역</h5><ul>{a.cost.breakdown.map((x, i) => <li key={i}>{x}</li>)}</ul>
                <h5>트레이드오프</h5><ul>{a.tradeoffs.map((x, i) => <li key={i}>{x}</li>)}</ul>
                <h5>엣지 케이스</h5><ul>{a.edgeCases.map((x, i) => <li key={i}>{x}</li>)}</ul>
                <h5>리스크</h5><ul>{a.risks.map((x, i) => <li key={i}>{x}</li>)}</ul>
                <h5 className="kill">철회 조건</h5><ul>{a.killCriteria.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </details>
              <h5>첫 단계</h5>
              <ul>{a.firstSteps.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          ))}
        </section>

        {s.comparison.length > 0 && (
          <section>
            <h2>판단 기준별 비교</h2>
            <table className="cmp">
              <thead><tr><th>기준</th>{ids.map((id) => <th key={id}>{id}</th>)}</tr></thead>
              <tbody>
                {s.comparison.map((row, i) => (
                  <tr key={i}>
                    <td>{row.criterion}</td>
                    {ids.map((id) => {
                      const sc = row.scores.find((x) => x.alternativeId === id)
                      return <td key={id}>{sc ? <><b>{sc.score}</b> <span className="muted small">{sc.note}</span></> : '-'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="fva">
          <div><h5>확인된 사실</h5><ul>{s.factsVsAssumptions.verifiedFacts.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          <div><h5>가정</h5><ul>{s.factsVsAssumptions.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          <div><h5>미확인</h5><ul>{s.factsVsAssumptions.unverified.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        </section>

        <section>
          <h2>다음 검증</h2>
          <table className="cmp">
            <thead><tr><th>확인할 것</th><th>방법</th><th>맞으면</th><th>틀리면</th></tr></thead>
            <tbody>{s.nextVerification.map((v, i) => <tr key={i}><td>{v.check}</td><td>{v.method}</td><td>{v.ifTrue}</td><td>{v.ifFalse}</td></tr>)}</tbody>
          </table>
        </section>

        {s.openQuestions.length > 0 && (
          <section>
            <h2>열린 질문</h2>
            <ul>{s.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
          </section>
        )}

        <section className="feedback">
          <div className="eyebrow">MIN의 결정 → 두뇌 학습</div>
          <p className="muted small">실제로 채택한 대안과 이유를 남기면 MPM이 다음 업무에서 MIN의 판단 성향으로 참고합니다.</p>
          <div className="fb-row">
            <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
              <option value="">채택한 대안</option>
              {s.alternatives.map((a) => <option key={a.id} value={`${a.id}. ${a.name}`}>{a.id}. {a.name}</option>)}
              <option value="모두 기각">모두 기각</option>
              <option value="혼합">혼합</option>
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="왜 그렇게 결정했나요? (MPM이 놓친 맥락)" />
            <button className="primary" disabled={!chosen} onClick={saveFeedback}>기록</button>
          </div>
        </section>
      </article>
      )}
    </div>
  )
}
