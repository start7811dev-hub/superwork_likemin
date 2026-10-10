/**
 * 작은 비밀 값 저장소 (OS 키체인 암호화). GitHub 토큰, MCP 서버 토큰 등.
 * Claude API 키·Admin 키는 기존 파일을 그대로 쓴다.
 */
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { userDir } from './paths'

const file = () => join(userDir(), 'secrets.bin')

function load(): Record<string, string> {
  if (!existsSync(file()) || !safeStorage.isEncryptionAvailable()) return {}
  try {
    return JSON.parse(safeStorage.decryptString(readFileSync(file())))
  } catch {
    return {}
  }
}

export function getSecret(name: string): string | undefined {
  return load()[name] || undefined
}

export function setSecret(name: string, value: string | null): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS 암호화 저장소를 사용할 수 없습니다.')
  const all = load()
  if (value) all[name] = value
  else delete all[name]
  writeFileSync(file(), safeStorage.encryptString(JSON.stringify(all)))
}

export const hasSecret = (name: string) => !!getSecret(name)
