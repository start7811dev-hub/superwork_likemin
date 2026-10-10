import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { estimateCost, type RunRecord, type RunSummary } from '../../shared/types'
import { userDir } from '../paths'

const dir = () => userDir('runs')
const file = (id: string) => join(dir(), `${id.replace(/[^\w-]/g, '')}.json`)

export function saveRun(run: RunRecord): void {
  run.updatedAt = new Date().toISOString()
  writeFileSync(file(run.id), JSON.stringify(run, null, 2))
}

export function getRun(id: string): RunRecord | null {
  const p = file(id)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function listRuns(): RunSummary[] {
  return readdirSync(dir())
    .filter((f) => f.endsWith('.json'))
    .map((f): RunSummary | null => {
      try {
        const r: RunRecord = JSON.parse(readFileSync(join(dir(), f), 'utf8'))
        return { id: r.id, title: r.title, createdAt: r.createdAt, status: r.status, costUsd: estimateCost(r.usage), demo: r.demo }
      } catch {
        return null
      }
    })
    .filter((r): r is RunSummary => r !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function removeRun(id: string): void {
  rmSync(file(id), { force: true })
}

/** 앱이 비정상 종료되어 'running'으로 남은 기록을 정리한다. */
export function recoverInterrupted(): void {
  for (const s of listRuns()) {
    if (s.status !== 'running') continue
    const r = getRun(s.id)
    if (!r) continue
    r.status = 'error'
    r.error = '앱이 종료되어 실행이 중단되었습니다.'
    saveRun(r)
  }
}
