import type { Factbook } from '@shared/schemas'

const PALETTE = ['#ff3fa4', '#a6f43c', '#6aa8ff', '#ffc94d', '#b08cff', '#4fd1c5', '#ff9f6e']
const CAT: Record<string, string> = { market: '시장', consumer: '소비자', brand: '브랜드', product: '제품', competitor: '경쟁', technology: '기술', regulation: '규제', other: '기타' }

/** 데이터셋을 간단한 막대 인포그래픽으로 */
function Bars({ d }: { d: Factbook['datasets'][number] }) {
  const max = Math.max(1, ...d.rows.map((r) => Math.abs(r.value)))
  return (
    <div className="fb-chart">
      <div className="fb-chart-title">{d.title} <span className="muted small">({d.unit})</span></div>
      {d.rows.map((r, i) => (
        <div key={i} className="fb-bar-row" title={r.note}>
          <span className="fb-bar-label">{r.label}</span>
          <span className="fb-bar-track"><span className="fb-bar" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} /></span>
          <span className="fb-bar-val">{r.value.toLocaleString()}</span>
        </div>
      ))}
      <div className="small muted">출처: {d.source}</div>
    </div>
  )
}

export default function FactbookView({ f }: { f: Factbook }) {
  return (
    <div className="factbook">
      <p className="muted">{f.scope}</p>

      {f.datasets.length > 0 && (
        <section>
          <h2>데이터</h2>
          <div className="fb-charts">{f.datasets.map((d, i) => <Bars key={i} d={d} />)}</div>
        </section>
      )}

      {f.products.length > 0 && (
        <section>
          <h2>브랜드 · 제품 (USP · 키피처 2 depth)</h2>
          <div className="fb-products">
            {f.products.map((p, i) => (
              <div key={i} className={`fb-product role-${p.role}`}>
                <div className="fb-product-head">
                  <b>{p.brand} {p.name}</b>
                  <span className="tag">{p.role === 'ours' ? '우리' : p.role === 'competitor' ? '경쟁' : '참고'}</span>
                  {p.price && <span className="muted small">{p.price}</span>}
                </div>
                <p className="small">{p.positioning}</p>
                <p><b>USP</b> {p.usp}</p>
                <ul className="fb-features">
                  {p.keyFeatures.map((k, j) => (
                    <li key={j}>
                      <b>{k.feature}</b> → {k.benefit}
                      <div className="fb-explainer">💡 {k.explainer}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {f.competitors.length > 0 && (
        <section>
          <h2>경쟁사</h2>
          <table className="cmp">
            <thead><tr><th>경쟁사</th><th>포지셔닝</th><th>강점</th><th>약점</th><th>주요 제품</th></tr></thead>
            <tbody>
              {f.competitors.map((c, i) => (
                <tr key={i}><td><b>{c.name}</b></td><td>{c.positioning}</td><td>{c.strengths.join(', ')}</td><td>{c.weaknesses.join(', ')}</td><td>{c.keyProducts.join(', ')}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>사실 ({f.facts.length})</h2>
        <table className="cmp">
          <thead><tr><th>분류</th><th>사실</th><th>출처</th><th>신뢰</th></tr></thead>
          <tbody>
            {f.facts.map((x, i) => (
              <tr key={i}>
                <td><span className="tag">{CAT[x.category] ?? x.category}</span></td>
                <td>{x.statement}</td>
                <td className="small">{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.source}</a> : x.source}{x.date && ` · ${x.date}`}</td>
                <td className="small">{x.reliability === 'high' ? '높음' : '중간'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {f.glossary.length > 0 && (
        <section>
          <h2>용어</h2>
          <dl className="fb-glossary">{f.glossary.map((g, i) => <div key={i}><dt>{g.term}</dt><dd>{g.explanation}</dd></div>)}</dl>
        </section>
      )}

      {f.gaps.length > 0 && (
        <section>
          <h2>확인하지 못한 것</h2>
          <ul>{f.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </section>
      )}
    </div>
  )
}
