/**
 * LIKE MIN 두뇌 로더.
 *
 * 두뇌 = 번들 두뇌 팩(앱과 함께 업데이트) + 사용자 오버레이(userData/brain, 업데이트해도 유지).
 *  - doctrine.md / roster.json : 사용자 파일이 있으면 번들 파일을 대체한다.
 *  - identity/*.md, knowledge/*.md : 번들 + 사용자 파일을 합친다. (같은 이름은 사용자 우선)
 *  - memory.json : 사용자가 리포트에 남긴 채택 결정·메모. MPM이 과거 판단으로 참고한다.
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { BrainFile, BrainMemoryItem, BrainSnapshot, RoleDef } from '../../shared/types'
import { resourceDir, userDir } from '../paths'

interface Manifest {
  version: string
  files: { doctrine: string; roster: string; identityDir: string; knowledgeDir: string }
}

const bundled = () => resourceDir('brain')
const overlay = () => userDir('brain')

function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(bundled(), 'manifest.json'), 'utf8'))
}

function mdFiles(dir: string, source: BrainFile['source']): BrainFile[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort()
    .map((name) => ({ name, source, content: readFileSync(join(dir, name), 'utf8') }))
}

function merged(sub: string): BrainFile[] {
  const map = new Map<string, BrainFile>()
  for (const f of mdFiles(join(bundled(), sub), 'bundled')) map.set(f.name, f)
  for (const f of mdFiles(join(overlay(), sub), 'user')) map.set(f.name, f)
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const memoryPath = () => join(overlay(), 'memory.json')

export function loadMemory(): BrainMemoryItem[] {
  try {
    return JSON.parse(readFileSync(memoryPath(), 'utf8'))
  } catch {
    return []
  }
}

export function saveMemoryItem(item: BrainMemoryItem): void {
  const items = loadMemory().filter((m) => m.runId !== item.runId)
  items.unshift(item)
  writeFileSync(memoryPath(), JSON.stringify(items.slice(0, 200), null, 2))
}

export function removeMemoryItem(runId: string): void {
  writeFileSync(memoryPath(), JSON.stringify(loadMemory().filter((m) => m.runId !== runId), null, 2))
}

export function loadBrain(): BrainSnapshot {
  const m = readManifest()
  const userDoctrine = join(overlay(), m.files.doctrine)
  const userRoster = join(overlay(), m.files.roster)
  const doctrineOverridden = existsSync(userDoctrine)
  const rosterOverridden = existsSync(userRoster)
  const doctrine = readFileSync(doctrineOverridden ? userDoctrine : join(bundled(), m.files.doctrine), 'utf8')
  const roster = JSON.parse(readFileSync(rosterOverridden ? userRoster : join(bundled(), m.files.roster), 'utf8'))
  return {
    version: m.version,
    doctrine,
    doctrineOverridden,
    roles: roster.roles as RoleDef[],
    rosterOverridden,
    identity: merged(m.files.identityDir),
    knowledge: merged(m.files.knowledgeDir),
    memory: loadMemory(),
    userDir: overlay()
  }
}

export function saveDoctrine(text: string | null): void {
  const p = join(overlay(), readManifest().files.doctrine)
  if (text === null) rmSync(p, { force: true })
  else writeFileSync(p, text)
}

export function saveRoster(roles: RoleDef[] | null): void {
  const p = join(overlay(), readManifest().files.roster)
  if (roles === null) rmSync(p, { force: true })
  else writeFileSync(p, JSON.stringify({ roles }, null, 2))
}

function safeName(name: string): string {
  const base = basename(name).replace(/[^\p{L}\p{N}._ -]/gu, '_').trim() || 'note'
  return base.endsWith('.md') ? base : `${base}.md`
}

export function addKnowledge(name: string, content: string): void {
  const dir = join(overlay(), readManifest().files.knowledgeDir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, safeName(name)), content)
}

export function removeKnowledge(name: string): void {
  rmSync(join(overlay(), readManifest().files.knowledgeDir, safeName(name)), { force: true })
}

/**
 * MPM 시스템 프롬프트의 고정부(캐시 대상).
 * 실행 간에 바뀌지 않는 정체성·교리·지식만 포함한다. 메모리는 별도 블록으로 분리.
 */
export function brainContext(b: BrainSnapshot): string {
  const identity = b.identity.map((f) => `<document name="${f.name}">\n${f.content}\n</document>`).join('\n')
  const knowledge = b.knowledge.map((f) => `<document name="${f.name}">\n${f.content}\n</document>`).join('\n')
  return [
    '당신은 SUPER WORK – LIKE MIN의 일원이다. 아래의 MIN 정체성 문서와 운영 교리가 당신의 판단 방식이다.',
    '이 문서들의 문구를 흉내 내지 말고, 그 안의 판단 습관(책임 설계, 맥락 운영, 믿지 않는 검증, 최소 3개 대안, 브랜드/소비자/시장 코어)을 실제 업무에 적용하라.',
    `<min_identity>\n${identity}\n</min_identity>`,
    `<operating_doctrine>\n${b.doctrine}\n</operating_doctrine>`,
    knowledge ? `<min_knowledge>\n${knowledge}\n</min_knowledge>` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function memoryContext(b: BrainSnapshot): string {
  if (!b.memory.length) return ''
  const items = b.memory
    .slice(0, 8)
    .map((m) => `- [${m.at.slice(0, 10)}] "${m.title}" → 채택: ${m.chosen}. 메모: ${m.note || '(없음)'}`)
    .join('\n')
  return `<past_decisions>\nMIN이 과거 리포트에서 실제로 채택한 결정과 이유다. 판단 성향을 참고하되, 현재 과업의 맥락이 다르면 그대로 따르지 않는다.\n${items}\n</past_decisions>`
}
