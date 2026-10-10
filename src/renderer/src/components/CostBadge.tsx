import { useEffect, useRef, useState } from 'react'
import type { CostStatus } from '@shared/types'
import { api } from '../api'

/** 상단 상시 노출: 소진 / 잔여 API 비용 */
export default function CostBadge({ pulse, onOpenSettings }: { pulse: number; onOpenSettings(): void }) {
  const [c, setC] = useState<CostStatus | null>(null)
  const last = useRef(0)

  const refresh = (force = false) => void api.cost.get(force).then(setC).catch(() => undefined)

  useEffect(() => {
    refresh(true)
    const t = window.setInterval(() => refresh(), 60_000)
    return () => window.clearInterval(t)
  }, [])

  // 실행 중 사용량 이벤트가 오면 최대 5초에 한 번 갱신
  useEffect(() => {
    if (!pulse || Date.now() - last.current < 5000) return
    last.current = Date.now()
    refresh()
  }, [pulse])

  if (!c) return null
  const ratio = c.budget > 0 ? Math.min(1, c.spent / c.budget) : 0
  const level = c.remaining === null ? 'none' : c.remaining <= 0 ? 'over' : ratio > 0.9 ? 'warn' : 'ok'
  return (
    <button className={`cost-badge lv-${level}`} onClick={onOpenSettings} title={c.error ?? `클릭하면 월별·일별·프로젝트별 소진을 봅니다 · ${c.source === 'admin' ? 'Cost API 실측' : '호출 기록 기준'} · ${new Date(c.updatedAt).toLocaleTimeString('ko-KR')} 갱신`}>
      <span className="cost-k">API {c.periodLabel}</span>
      <span className="cost-v">
        소진 <b>${c.spent.toFixed(2)}</b>
        {c.budget > 0 && <span className="muted"> / ${c.budget.toFixed(0)}</span>}
      </span>
      <span className="cost-sep" />
      <span className="cost-v">
        잔여 <b>{c.remaining === null ? '예산 미설정' : `$${c.remaining.toFixed(2)}`}</b>
        {c.budget > 0 && <span className="muted"> ({Math.max(0, 100 - ratio * 100).toFixed(0)}%)</span>}
      </span>
      {c.budget > 0 && (
        <span className="cost-bar"><i style={{ width: `${ratio * 100}%` }} /></span>
      )}
      <span className={`cost-src ${c.source}`}>{c.source === 'admin' ? '실측' : '추정'}</span>
    </button>
  )
}
