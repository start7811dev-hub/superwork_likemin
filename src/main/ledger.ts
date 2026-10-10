/**
 * API 사용량 장부. 호출 한 번마다 한 줄(JSONL)을 남긴다.
 * 실행 기록과 분리되어 있어, 실패한 실행·삭제한 기록·PPT 생성 비용도 월별로 누적된다.
 * 장부가 생기기 전의 실행은 처음 한 번 실행 기록에서 옮겨 온다.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRICING, type LedgerEntry, type UsageReport } from '../shared/types'
import { getRun, listRuns } from './store/runs'
import { userDir } from './paths'

const file = () => join(userDir(), 'usage-ledger.jsonl')

export function entryCost(e: Pick<LedgerEntry, 'model' | 'input' | 'output' | 'cacheRead' | 'cacheWrite'>): number {
  const p = PRICING[e.model] ?? PRICING[Object.keys(PRICING).find((k) => e.model.startsWith(k)) ?? '']
  if (!p) return 0
  return (e.input * p.in + e.output * p.out + e.cacheRead * p.cacheRead + e.cacheWrite * p.in * 1.25) / 1e6
}

export function recordCall(e: Omit<LedgerEntry, 'at' | 'cost'>): void {
  const entry: LedgerEntry = { at: new Date().toISOString(), ...e, cost: entryCost(e) }
  appendFileSync(file(), JSON.stringify(entry) + '\n')
}

/** 장부가 없으면 기존 실행 기록의 사용량을 실행 시각 기준으로 옮겨 온다 */
function ensureBackfill(): void {
  if (existsSync(file())) return
  const lines: string[] = []
  for (const s of listRuns()) {
    if (s.demo) continue
    const r = getRun(s.id)
    if (!r) continue
    for (const [model, u] of Object.entries(r.usage)) {
      const e = { model, input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite }
      lines.push(JSON.stringify({ at: r.createdAt, runId: r.id, kind: 'run', calls: u.calls, ...e, cost: entryCost(e) } satisfies LedgerEntry))
    }
  }
  writeFileSync(file(), lines.length ? lines.join('\n') + '\n' : '')
}

export function loadLedger(): LedgerEntry[] {
  ensureBackfill()
  return readFileSync(file(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as LedgerEntry
      } catch {
        return null
      }
    })
    .filter((e): e is LedgerEntry => e !== null)
}

export function spentSince(start: Date): number {
  return loadLedger()
    .filter((e) => new Date(e.at) >= start)
    .reduce((s, e) => s + e.cost, 0)
}

type Acc = { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }
const zero = (): Acc => ({ calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })
function add(a: Acc, e: LedgerEntry) {
  a.calls += e.calls ?? 1
  a.input += e.input
  a.output += e.output
  a.cacheRead += e.cacheRead
  a.cacheWrite += e.cacheWrite
  a.cost += e.cost
}

/** 월별 · 일별 · 프로젝트별 · 모델별 집계 (로컬 시간대 기준) */
export function usageReport(): UsageReport {
  const entries = loadLedger()
  const runs = new Map(listRuns().map((r) => [r.id, r]))
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  const dayKey = (d: Date) => `${monthKey(d)}-${pad(d.getDate())}`

  const months = new Map<string, Acc>()
  const days = new Map<string, Acc>()
  const projects = new Map<string, Acc & { firstAt: string }>()
  const models = new Map<string, Acc>()
  const total = zero()
  for (const e of entries) {
    const d = new Date(e.at)
    const m = months.get(monthKey(d)) ?? zero()
    add(m, e)
    months.set(monthKey(d), m)
    const dd = days.get(dayKey(d)) ?? zero()
    add(dd, e)
    days.set(dayKey(d), dd)
    const pk = e.runId ?? `(${e.kind})`
    const p = projects.get(pk) ?? { ...zero(), firstAt: e.at }
    add(p, e)
    if (e.at < p.firstAt) p.firstAt = e.at
    projects.set(pk, p)
    const md = models.get(e.model) ?? zero()
    add(md, e)
    models.set(e.model, md)
    add(total, e)
  }
  const sortDesc = <T,>(m: Map<string, T>) => [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  return {
    total,
    months: sortDesc(months).map(([key, a]) => ({ key, ...a })),
    days: sortDesc(days).slice(0, 62).map(([key, a]) => ({ key, ...a })),
    projects: [...projects.entries()]
      .map(([key, a]) => {
        const r = runs.get(key)
        const label = r ? r.title : key.startsWith('(') ? { '(export)': 'PPT 생성', '(validate)': '키 확인', '(run)': '실행' }[key] ?? key : '삭제된 실행'
        return { key, label, status: r?.status ?? (key.startsWith('(') ? 'other' : 'deleted'), ...a }
      })
      .sort((a, b) => b.firstAt.localeCompare(a.firstAt)),
    models: [...models.entries()].map(([key, a]) => ({ key, ...a })).sort((a, b) => b.cost - a.cost)
  }
}
