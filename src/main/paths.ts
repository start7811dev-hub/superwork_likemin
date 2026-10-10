import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/** 앱과 함께 배포되는 리소스(brain/, plugins/) 위치 */
export function resourceDir(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), name)
}

/** 사용자 데이터 위치. 업데이트해도 유지된다. */
export function userDir(...parts: string[]): string {
  const dir = join(app.getPath('userData'), ...parts)
  mkdirSync(dir, { recursive: true })
  return dir
}
