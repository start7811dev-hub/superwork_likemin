/**
 * API 비용 모니터.
 * - 소진: Admin API 키가 있으면 Usage & Cost Admin API(/v1/organizations/cost_report)로 조직 실측 비용,
 *         없으면 이 앱이 기록한 호출별 토큰 사용량으로 추정.
 * - 잔여: Claude API는 선불 잔액 조회를 제공하지 않으므로 설정의 예산(월 예산 또는 확인한 잔액) − 소진.
 */
import { safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CostStatus } from '../shared/types'
import { loadSettings } from './settings'
import { listRuns } from './store/runs'
import { userDir } from './paths'

const adminKeyPath = () => join(userDir(), 'admin-key.bin')

function getAdminKey(): string | null {
  if (!existsSync(adminKeyPath()) || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(readFileSync(adminKeyPath()))
  } catch {
    return null
  }
}

export const hasAdminKey = () => !!getAdminKey()

export async function setAdminKey(key: string | null): Promise<{ ok: boolean; message: string }> {
  if (!key) {
    rmSync(adminKeyPath(), { force: true })
    cache = null
    return { ok: true, message: 'Admin 키를 삭제했습니다.' }
  }
  const trimmed = key.trim()
  try {
    await fetchCost(trimmed, new Date(Date.now() - 86400000))
  } catch (err) {
    return { ok: false, message: `검증 실패: ${(err as Error).message}` }
  }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: 'OS 암호화 저장소를 사용할 수 없습니다.' }
  writeFileSync(adminKeyPath(), safeStorage.encryptString(trimmed))
  cache = null
  return { ok: true, message: 'Admin 키를 저장했습니다. 이제 조직 실측 비용을 표시합니다.' }
}

/** Cost API: 일 단위 버킷, 최대 31개/페이지. amount는 센트 단위 문자열. */
async function fetchCost(adminKey: string, start: Date): Promise<number> {
  let page: string | null = null
  let cents = 0
  for (let i = 0; i < 24; i++) {
    const q = new URLSearchParams({ starting_at: start.toISOString(), ending_at: new Date().toISOString(), bucket_width: '1d', limit: '31' })
    if (page) q.set('page', page)
    const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, {
      headers: { 'x-api-key': adminKey, 'anthropic-version': '2023-06-01', 'user-agent': 'SuperWorkLikeMin/0.2' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`)
    const body = (await res.json()) as { data: { results: { amount: string }[] }[]; has_more: boolean; next_page: string | null }
    for (const b of body.data) for (const r of b.results) cents += Number(r.amount) || 0
    if (!body.has_more || !body.next_page) break
    page = body.next_page
  }
  return cents / 100
}

function periodStart(): { start: Date; label: string } {
  const { budget } = loadSettings()
  if (budget.mode === 'credit' && budget.since) {
    const d = new Date(budget.since)
    if (!Number.isNaN(d.getTime())) return { start: d, label: `${budget.since} 이후` }
  }
  const now = new Date()
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), label: `${now.getMonth() + 1}월` }
}

function localSpent(start: Date): number {
  return listRuns()
    .filter((r) => !r.demo && new Date(r.createdAt) >= start)
    .reduce((sum, r) => sum + r.costUsd, 0)
}

let cache: { at: number; value: CostStatus } | null = null

export async function getCostStatus(force = false): Promise<CostStatus> {
  if (!force && cache && Date.now() - cache.at < 60_000) {
    // 로컬 소진은 실행 중에도 변하므로 로컬 모드는 항상 다시 계산
    if (cache.value.source === 'admin') return cache.value
  }
  const { budget } = loadSettings()
  const { start, label } = periodStart()
  let spent = localSpent(start)
  let source: CostStatus['source'] = 'local'
  let error: string | undefined
  const key = getAdminKey()
  if (key) {
    try {
      spent = await fetchCost(key, start)
      source = 'admin'
    } catch (err) {
      error = `실측 조회 실패, 앱 기록으로 추정: ${(err as Error).message}`
    }
  }
  const value: CostStatus = {
    spent,
    remaining: budget.amount > 0 ? budget.amount - spent : null,
    budget: budget.amount,
    source,
    periodLabel: label,
    updatedAt: new Date().toISOString(),
    error
  }
  cache = { at: Date.now(), value }
  return value
}

