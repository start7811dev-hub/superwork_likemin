import { safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { userDir } from './paths'

const settingsPath = () => join(userDir(), 'settings.json')
const keyPath = () => join(userDir(), 'api-key.bin')

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), 'utf8'))
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      models: { ...DEFAULT_SETTINGS.models, ...raw.models },
      budget: { ...DEFAULT_SETTINGS.budget, ...raw.budget },
      integrations: raw.integrations ?? {}
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(s: Settings): void {
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2))
}

/** API 키는 OS 키체인(safeStorage)으로 암호화해 저장한다. */
export function getApiKey(): { key: string | null; source: 'stored' | 'env' | 'none' } {
  if (existsSync(keyPath()) && safeStorage.isEncryptionAvailable()) {
    try {
      return { key: safeStorage.decryptString(readFileSync(keyPath())), source: 'stored' }
    } catch {
      /* 손상된 키 파일은 무시 */
    }
  }
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' }
  return { key: null, source: 'none' }
}

export async function setApiKey(key: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = key.trim()
  if (!trimmed) return { ok: false, message: '키가 비어 있습니다.' }
  try {
    const client = new Anthropic({ apiKey: trimmed })
    await client.models.retrieve(DEFAULT_SETTINGS.models.mpm)
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, message: '인증 실패: 키를 확인하세요.' }
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, message: '네트워크에 연결할 수 없습니다.' }
    if (!(err instanceof Anthropic.APIError)) return { ok: false, message: String(err) }
    // 그 외 API 오류(권한 등)는 키 자체는 유효하므로 저장한다.
  }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: 'OS 암호화 저장소를 사용할 수 없습니다.' }
  writeFileSync(keyPath(), safeStorage.encryptString(trimmed))
  return { ok: true, message: '저장되었습니다.' }
}

export function clearApiKey(): void {
  rmSync(keyPath(), { force: true })
}
