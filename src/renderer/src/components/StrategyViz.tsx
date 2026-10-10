/**
 * SUPER INSIGHT 전략 시각화 — 아이소메트릭 다이어그램 키트 룩앤필.
 * AARRR · TOWS · STP 2.0 · CDJ, 그리고 MIN'S 4-3-2 THINKING.
 * 각 다이어그램은 SVG로 저장할 수 있다.
 */
import { useRef, type ReactNode } from 'react'
import type { Insight } from '@shared/schemas'
import { Block, iso, pathD, pts, type Pt } from './iso'

const PINK = '#ff3fa4'
const LIME = '#a6f43c'
const HEALTH = ['#ff8a8a', '#ffb870', '#ffe07a', '#c9f08a', '#7ee0a1']
const INK = '#2b2b3a'

const cut = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n).join('')}…` : s)

function viewBoxOf(points: Pt[], pad = 30): string {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
  return `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`
}

function Label({ at, title, sub, tone = 'white', w = 110 }: { at: Pt; title: string; sub?: string; tone?: 'white' | 'ink' | 'pink'; w?: number }) {
  const h = sub ? 34 : 22
  const fill = tone === 'ink' ? INK : tone === 'pink' ? PINK : '#ffffff'
  const ink = tone === 'white' ? INK : '#ffffff'
  return (
    <g transform={`translate(${at[0] - w / 2},${at[1] - h})`}>
      <rect width={w} height={h} rx={h / 2} fill={fill} stroke="rgba(30,30,60,.08)" filter="url(#vizShadow)" />
      <text x={w / 2} y={sub ? 14 : 14.5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={ink}>{title}</text>
      {sub && <text x={w / 2} y={27} textAnchor="middle" fontSize={9} fill={tone === 'white' ? '#7a8090' : 'rgba(255,255,255,.8)'}>{sub}</text>}
    </g>
  )
}

function Diagram({ id, title, subtitle, viewBox, svg, children }: { id: string; title: string; subtitle: string; viewBox: string; svg: ReactNode; children?: ReactNode }) {
  const ref = useRef<SVGSVGElement>(null)
  const save = () => {
    const el = ref.current
    if (!el) return
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${el.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')}`
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${id}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section className="viz">
      <div className="viz-head">
        <div>
          <div className="eyebrow">{subtitle}</div>
          <h2>{title}</h2>
        </div>
        <button className="chip" onClick={save}>SVG 저장</button>
      </div>
      <svg ref={ref} className="viz-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" style={{ fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }}>
        <defs>
          <filter id="vizShadow" x="-20%" y="-30%" width="140%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#2b2b3a" floodOpacity="0.10" />
          </filter>
        </defs>
        {svg}
      </svg>
      {children}
    </section>
  )
}

/* ---------- MIN'S 4-3-2 THINKING ---------- */
export function Pyramid432({ insight, compact = false }: { insight: Insight; compact?: boolean }) {
  // 계단식: 4는 앞줄 바닥, 3은 가운데 줄 한 칸 위, 2는 뒷줄 두 칸 위 — 모든 윗면이 보인다
  const tiers: { n: number; z: number; gy: number; color: string }[] = [
    { n: 2, z: 44, gy: -1.5, color: '#ffd8e8' },
    { n: 3, z: 22, gy: 0, color: '#d9f7c4' },
    { n: 4, z: 0, gy: 1.5, color: '#e7dcff' }
  ]
  const blocks = tiers.flatMap((t) =>
    Array.from({ length: t.n }, (_, i) => ({ gx: (i - (t.n - 1) / 2) * 1.45, gy: t.gy, z: t.z, color: t.color, num: i + 1, tier: t.n }))
  )
  const bounds = blocks.flatMap((b) => [iso(b.gx - 1, b.gy - 1, b.z + 60), iso(b.gx + 1, b.gy + 1, b.z)])
  const svg = (
    <>
      {blocks.map((b, k) => (
        <g key={k}>
          <Block gx={b.gx} gy={b.gy} w={1.3} d={1.3} h={22 + b.z} z={0} color={b.color} r={8} />
          <text x={iso(b.gx, b.gy, b.z + 22)[0]} y={iso(b.gx, b.gy, b.z + 22)[1] + 4} textAnchor="middle" fontSize={12} fontWeight={800} fill={INK}>
            {b.tier === 4 ? 'S' : b.tier === 3 ? 'K' : 'C'}{b.num}
          </text>
        </g>
      ))}
    </>
  )
  const cols = (
    <div className="p432">
      <div><h5>4 SUPER STRATEGIES</h5><ol>{insight.superStrategies.map((s, i) => <li key={i}><b>{s.name}</b> <span className="tag">{s.methods}</span><div className="small">{s.description}</div></li>)}</ol></div>
      <div><h5>MIN'S 3 KEY SUCCESS FACTORS</h5><ol>{insight.ksf.map((k, i) => <li key={i}><b>{k.factor}</b><div className="small">{k.why}</div><div className="small muted">지표: {k.measure}</div></li>)}</ol></div>
      <div className="claims"><h5>2 CORE KEY-CLAIMS</h5><ol>{insight.keyClaims.map((c, i) => <li key={i}><b>“{c.claim}”</b><div className="small">{c.support}</div></li>)}</ol></div>
    </div>
  )
  if (compact)
    return (
      <div className="p432-compact">
        <svg className="viz-svg small" viewBox={viewBoxOf(bounds, 16)}>{svg}</svg>
        {cols}
      </div>
    )
  return (
    <Diagram id="min-4-3-2" title="MIN'S 4-3-2 THINKING" subtitle="SUPER INSIGHT" viewBox={viewBoxOf(bounds, 20)} svg={svg}>
      {cols}
    </Diagram>
  )
}

/* ---------- AARRR ---------- */
function Aarrr({ insight }: { insight: Insight }) {
  const st = insight.aarrr
  const items = st.map((s, i) => ({ ...s, gx: i * 2.4, h: 78 - i * 13 }))
  const bounds = items.flatMap((s) => [iso(s.gx - 1, -1, s.h + 60), iso(s.gx + 1.4, 2.2)])
  const svg = (
    <>
      <path d={pathD(items.map((s) => iso(s.gx, 0, 1)))} stroke={PINK} strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.7} />
      {items.map((s, i) => {
        const top = iso(s.gx, 0, s.h)
        const color = HEALTH[Math.min(4, Math.max(0, Math.round(s.health) - 1))]
        return (
          <g key={s.stage}>
            <Block gx={s.gx} gy={0} w={1.4} d={1.4} h={s.h} color={color} r={8} />
          </g>
        )
      })}
      {items.slice(0, -1).map((s) => {
        const [x, y] = iso(s.gx + 1.2, 1.3)
        return (
          <g key={`leak-${s.stage}`} transform={`translate(${x},${y})`}>
            <path d="M0 -7 q4 6 0 9 q-4 -3 0 -9" fill="#ff5a4e" />
            <text x={0} y={14} textAnchor="middle" fontSize={9} fill="#d6453b">{cut(s.leak, 10)}</text>
          </g>
        )
      })}
      {items.map((s, i) => {
        const top = iso(s.gx, 0, s.h)
        return <Label key={`lb-${s.stage}`} at={[top[0], top[1] - 14]} title={`${i + 1}. ${s.label}`} sub={`건강도 ${s.health}/5`} tone={s.health <= 2 ? 'pink' : 'white'} w={96} />
      })}
    </>
  )
  return (
    <Diagram id="aarrr" title="AARRR 퍼널" subtitle="획득 → 활성화 → 유지 → 매출 → 추천" viewBox={viewBoxOf(bounds)} svg={svg}>
      <table className="cmp viz-table">
        <thead><tr><th>단계</th><th>현재</th><th>이탈·병목</th><th>개선 레버</th></tr></thead>
        <tbody>{st.map((s) => <tr key={s.stage}><td><b>{s.label}</b></td><td>{s.current}</td><td className="leak">{s.leak}</td><td>{s.lever}</td></tr>)}</tbody>
      </table>
    </Diagram>
  )
}

/* ---------- TOWS ---------- */
function Tows({ insight }: { insight: Insight }) {
  const t = insight.tows
  const G = 1.8
  const cells = [
    { k: 'SO', gx: 0, gy: 0, color: '#c9f08a', items: t.so },
    { k: 'WO', gx: G, gy: 0, color: '#d6e6ff', items: t.wo },
    { k: 'ST', gx: 0, gy: G, color: '#fff1b8', items: t.st },
    { k: 'WT', gx: G, gy: G, color: '#ffd8e8', items: t.wt }
  ]
  const heads = [
    { k: 'S 강점', gx: 0, gy: -G, color: '#ffffff' },
    { k: 'W 약점', gx: G, gy: -G, color: '#ffffff' },
    { k: 'O 기회', gx: -G, gy: 0, color: '#ffffff' },
    { k: 'T 위협', gx: -G, gy: G, color: '#ffffff' }
  ]
  const bounds = [...cells, ...heads].flatMap((c) => [iso(c.gx - 1, c.gy - 1, 70), iso(c.gx + 1, c.gy + 1)])
  const svg = (
    <>
      {heads.map((h) => (
        <g key={h.k}>
          <Block gx={h.gx} gy={h.gy} w={1.5} d={1.5} h={6} color={h.color} r={8} />
          <text x={iso(h.gx, h.gy, 6)[0]} y={iso(h.gx, h.gy, 6)[1] + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill={INK}>{h.k}</text>
        </g>
      ))}
      {cells.map((c) => {
        const top = iso(c.gx, c.gy, 24)
        return (
          <g key={c.k}>
            <Block gx={c.gx} gy={c.gy} w={1.5} d={1.5} h={24} color={c.color} r={8} />
            <Label at={[top[0], top[1] - 10]} title={`${c.k} · ${c.items.length}`} sub={cut(c.items[0] ?? '', 11)} tone={c.k === 'SO' ? 'ink' : 'white'} w={104} />
          </g>
        )
      })}
    </>
  )
  return (
    <Diagram id="tows" title="TOWS 매트릭스" subtitle="SWOT 교차 → 실행 전략" viewBox={viewBoxOf(bounds)} svg={svg}>
      <div className="tows-grid">
        {cells.map((c) => (
          <div key={c.k} style={{ borderTopColor: c.color }}>
            <h5>{c.k} {c.k === 'SO' ? '강점×기회' : c.k === 'WO' ? '약점×기회' : c.k === 'ST' ? '강점×위협' : '약점×위협'}</h5>
            <ul>{c.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="swot-row small muted">
        <span><b>S</b> {t.strengths.join(' · ')}</span>
        <span><b>W</b> {t.weaknesses.join(' · ')}</span>
        <span><b>O</b> {t.opportunities.join(' · ')}</span>
        <span><b>T</b> {t.threats.join(' · ')}</span>
      </div>
    </Diagram>
  )
}

/* ---------- STP 2.0 ---------- */
function Stp({ insight }: { insight: Insight }) {
  const p = insight.stp.positioning
  const S = 0.5 // -5~5 → -2.5~2.5 grid
  const map = (x: number, y: number): [number, number] => [x * S, -y * S]
  const corners: Pt[] = [iso(-2.9, -2.9), iso(2.9, -2.9), iso(2.9, 2.9), iso(-2.9, 2.9)]
  const bounds = [...corners, iso(-3, -3, 80), iso(3, 3), iso(4.2, 0), iso(-4.2, 0), iso(0, -3.8, 20), iso(0, 3.8)]
  const svg = (
    <>
      <polygon points={pts(corners)} fill="#ffffff" stroke="#e6e8ee" strokeWidth={10} strokeLinejoin="round" />
      {[-2, -1, 1, 2].map((g) => (
        <g key={g} stroke="#f0f1f5">
          <line x1={iso(g, -2.6)[0]} y1={iso(g, -2.6)[1]} x2={iso(g, 2.6)[0]} y2={iso(g, 2.6)[1]} />
          <line x1={iso(-2.6, g)[0]} y1={iso(-2.6, g)[1]} x2={iso(2.6, g)[0]} y2={iso(2.6, g)[1]} />
        </g>
      ))}
      <line x1={iso(-2.7, 0)[0]} y1={iso(-2.7, 0)[1]} x2={iso(2.7, 0)[0]} y2={iso(2.7, 0)[1]} stroke={INK} strokeWidth={1.4} />
      <line x1={iso(0, 2.7)[0]} y1={iso(0, 2.7)[1]} x2={iso(0, -2.7)[0]} y2={iso(0, -2.7)[1]} stroke={INK} strokeWidth={1.4} />
      <text x={iso(3.4, 0)[0] + 4} y={iso(3.4, 0)[1] + 8} fontSize={10} fontWeight={700} fill={INK}>{cut(p.xAxis.high, 10)} →</text>
      <text x={iso(-3.4, 0)[0] - 4} y={iso(-3.4, 0)[1] - 2} fontSize={10} textAnchor="end" fill="#7a8090">← {cut(p.xAxis.low, 10)}</text>
      <text x={iso(0, -3.4)[0] + 8} y={iso(0, -3.4)[1] - 4} fontSize={10} fontWeight={700} textAnchor="middle" fill={INK}>↑ {cut(p.yAxis.high, 10)}</text>
      <text x={iso(0, 3.4)[0] - 8} y={iso(0, 3.4)[1] + 16} fontSize={10} textAnchor="middle" fill="#7a8090">{cut(p.yAxis.low, 10)} ↓</text>
      {[...p.points].sort((a, b) => (a.x - a.y) - (b.x - b.y)).map((pt, i) => {
        const [gx, gy] = map(pt.x, pt.y)
        const h = pt.isUs ? 46 : 24
        const top = iso(gx, gy, h)
        return (
          <g key={i}>
            <Block gx={gx} gy={gy} w={0.42} d={0.42} h={h} color={pt.isUs ? PINK : '#cfd3dc'} r={5} />
            <Label at={[top[0], top[1] - 6]} title={pt.name} tone={pt.isUs ? 'pink' : 'white'} w={Math.max(56, [...pt.name].length * 11 + 18)} />
          </g>
        )
      })}
    </>
  )
  return (
    <Diagram id="stp" title="STP 2.0 · 초개인화 포지셔닝" subtitle="행동 패턴 · 취향 세분화 → 타깃 → 포지셔닝" viewBox={viewBoxOf(bounds)} svg={svg}>
      <p className="positioning">“{p.statement}”</p>
      <div className="seg-grid">
        {insight.stp.segments.map((s, i) => {
          const isTarget = s.name === insight.stp.target.segment
          return (
            <div key={i} className={isTarget ? 'target' : ''}>
              <div className="seg-head"><b>{s.name}</b>{isTarget && <span className="tag">TARGET</span>}</div>
              <div className="small">행동: {s.behavior}</div>
              <div className="small">취향: {s.taste}</div>
              <div className="small muted">규모: {s.size} · 매력도 {'●'.repeat(Math.round(s.attractiveness))}{'○'.repeat(5 - Math.round(s.attractiveness))}</div>
            </div>
          )
        })}
      </div>
      <p className="small"><b>타깃 선정 이유</b> {insight.stp.target.why}</p>
    </Diagram>
  )
}

/* ---------- CDJ ---------- */
function Cdj({ insight }: { insight: Insight }) {
  const st = insight.cdj.map((s, i) => ({ ...s, gx: 0, gy: -i * 2.4, h: 10 + (Math.max(-2, Math.min(2, s.emotion)) + 2) * 12 }))
  const tops = st.map((s) => iso(s.gx, s.gy, s.h + 4))
  const curve = tops.reduce((d, p, i) => {
    if (i === 0) return `M${p[0]} ${p[1]}`
    const prev = tops[i - 1]
    const mx = (prev[0] + p[0]) / 2
    return `${d} C${mx} ${prev[1]} ${mx} ${p[1]} ${p[0]} ${p[1]}`
  }, '')
  const bounds = st.flatMap((s) => [iso(s.gx - 1, s.gy - 1, s.h + 70), iso(s.gx + 1, s.gy + 1)])
  const face = (e: number) => (e >= 2 ? '😍' : e >= 1 ? '🙂' : e >= 0 ? '😐' : e >= -1 ? '😕' : '😣')
  const svg = (
    <>
      <path d={pathD(st.map((s) => iso(s.gx, s.gy, 1)))} stroke={LIME} strokeWidth={6} strokeLinecap="round" fill="none" />
      {[...st].reverse().map((s) => (
        <Block key={s.stage} gx={s.gx} gy={s.gy} w={1.5} d={1.5} h={s.h} color={s.emotion >= 1 ? '#d9f7c4' : s.emotion >= 0 ? '#fff1b8' : '#ffd8e8'} r={8} />
      ))}
      <path d={curve} stroke={PINK} strokeWidth={2.4} fill="none" strokeDasharray="5 5" />
      {st.map((s, i) => (
        <g key={`l${i}`}>
          <text x={tops[i][0]} y={tops[i][1] - 2} textAnchor="middle" fontSize={16}>{face(s.emotion)}</text>
          <Label at={[tops[i][0], tops[i][1] - 22]} title={`${i + 1}. ${s.label}`} sub={`터치포인트 ${s.touchpoints.length}`} w={92} />
        </g>
      ))}
    </>
  )
  return (
    <Diagram id="cdj" title="CDJ · 고객 여정 지도" subtitle="인지 → 고려 → 구매 → 옹호 · 감정 곡선" viewBox={viewBoxOf(bounds)} svg={svg}>
      <table className="cmp viz-table">
        <thead><tr><th>단계</th><th>터치포인트</th><th>페인</th><th>기회</th></tr></thead>
        <tbody>{insight.cdj.map((s) => <tr key={s.stage}><td><b>{s.label}</b> {face(s.emotion)}</td><td>{s.touchpoints.join(', ')}</td><td className="leak">{s.pain}</td><td>{s.opportunity}</td></tr>)}</tbody>
      </table>
    </Diagram>
  )
}

export default function StrategyViz({ insight }: { insight: Insight }) {
  return (
    <div className="strategy">
      <Pyramid432 insight={insight} />
      <div className="viz-judgment small">
        <b>⚙️ 판단 엔진</b> {insight.judgment.decision}
        <span className="muted"> — {insight.judgment.basis.map((b) => b.source).join(', ')}</span>
      </div>
      <Aarrr insight={insight} />
      <Tows insight={insight} />
      <Stp insight={insight} />
      <Cdj insight={insight} />
    </div>
  )
}
