import { useEffect, useState } from 'react'
import type { CostStatus, UsageReport, UsageRow } from '@shared/types'
import { api } from '../api'

const usd = (n: number) => `$${n.toFixed(2)}`
const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n))
const STATUS: Record<string, string> = { done: '완료', error: '실패', cancelled: '중단', running: '진행 중', deleted: '삭제됨', other: '' }

function Table({ rows, keyLabel, max, showStatus }: { rows: UsageRow[]; keyLabel: string; max: number; showStatus?: boolean }) {
  if (!rows.length) return <p className="muted small">아직 기록이 없습니다.</p>
  return (
    <table className="cmp usage">
      <thead>
        <tr>
          <th>{keyLabel}</th>
          <th className="num">호출</th>
          <th className="num">입력</th>
          <th className="num">출력</th>
          <th className="num">캐시 읽기</th>
          <th className="num">캐시 쓰기</th>
          <th className="num">비용</th>
          <th className="bar-col" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              {r.label ?? r.key}
              {showStatus && r.status && STATUS[r.status] ? <span className={`tag ${r.status === 'done' ? 'ok' : r.status === 'error' ? 'r-high' : ''}`}>{STATUS[r.status]}</span> : null}
              {showStatus && r.firstAt ? <div className="small muted">{new Date(r.firstAt).toLocaleString('ko-KR')}</div> : null}
            </td>
            <td className="num">{r.calls.toLocaleString()}</td>
            <td className="num">{tok(r.input)}</td>
            <td className="num">{tok(r.output)}</td>
            <td className="num">{tok(r.cacheRead)}</td>
            <td className="num">{tok(r.cacheWrite)}</td>
            <td className="num"><b>{usd(r.cost)}</b></td>
            <td className="bar-col"><span className="ubar"><i style={{ width: `${max ? (r.cost / max) * 100 : 0}%` }} /></span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 월별 · 일별 · 프로젝트별 · 모델별 API 소진 */
export default function CostView({ onOpenSettings }: { onOpenSettings(): void }) {
  const [rep, setRep] = useState<UsageReport | null>(null)
  const [status, setStatus] = useState<CostStatus | null>(null)
  const [tab, setTab] = useState<'months' | 'days' | 'projects' | 'models'>('months')
  useEffect(() => {
    void api.cost.report().then(setRep)
    void api.cost.get(true).then(setStatus)
  }, [])
  if (!rep || !status) return null
  const rows = rep[tab]
  const max = Math.max(0, ...rows.map((r) => r.cost))
  const pct = status.budget > 0 ? Math.min(100, (status.spent / status.budget) * 100) : 0
  return (
    <div className="settings costview">
      <div className="cost-head">
        <div>
          <div className="eyebrow">API 비용</div>
          <h2>{status.periodLabel} 소진 {usd(status.spent)}</h2>
          <p className="muted small">
            {status.source === 'admin' ? 'Cost API 실측(조직 전체)' : '이 앱의 호출 기록 기준 추정'} · 실패한 실행, 삭제한 기록, PPT 생성 비용까지 포함
          </p>
        </div>
        <button className="ghost" onClick={onOpenSettings}>예산 설정</button>
      </div>
      <div className="cost-kpis">
        <div><span className="eyebrow">이번 기간 소진</span><b>{usd(status.spent)}</b></div>
        <div><span className="eyebrow">예산</span><b>{status.budget > 0 ? usd(status.budget) : '미설정'}</b></div>
        <div><span className="eyebrow">잔여</span><b className={status.remaining !== null && status.remaining < status.budget * 0.1 ? 'warn' : ''}>{status.remaining === null ? '—' : usd(status.remaining)}</b></div>
        <div><span className="eyebrow">누적 전체</span><b>{usd(rep.total.cost)}</b><span className="small muted">{tok(rep.total.input + rep.total.output)} 토큰 · {rep.total.calls}회</span></div>
      </div>
      {status.budget > 0 && (
        <div className="budget-line">
          <span className="ubar big"><i style={{ width: `${pct}%` }} /></span>
          <span className="small muted">예산의 {pct.toFixed(1)}% 사용</span>
        </div>
      )}
      <nav className="tabs">
        {([['months', '월별'], ['days', '일별'], ['projects', '프로젝트별'], ['models', '모델별']] as const).map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      <Table rows={rows} keyLabel={{ months: '월', days: '날짜', projects: '프로젝트', models: '모델' }[tab]} max={max} showStatus={tab === 'projects'} />
    </div>
  )
}
