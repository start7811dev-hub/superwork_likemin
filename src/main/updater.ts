/**
 * 앱 자동 업데이트 (electron-updater).
 * 배포 채널은 electron-builder.yml의 publish 설정(GitHub Releases 기본)을 따른다.
 * 두뇌 팩(brain/)은 앱 리소스에 포함되므로 앱 업데이트와 함께 갱신되고,
 * 사용자가 수정한 두뇌(userData/brain)는 업데이트 후에도 유지된다.
 */
import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = electronUpdater

export function initUpdater(getWin: () => BrowserWindow | null): { check(): Promise<void>; install(): void } {
  const send = (s: UpdateStatus) => getWin()?.webContents.send('updater:status', s)

  if (!app.isPackaged) {
    return {
      check: async () => send({ state: 'dev', message: '개발 모드에서는 업데이트를 확인하지 않습니다.' }),
      install: () => undefined
    }
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => send({ state: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => send({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', progress: p.percent }))
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => send({ state: 'error', message: e.message }))

  setTimeout(() => void autoUpdater.checkForUpdates().catch(() => undefined), 5000)

  return {
    check: async () => {
      await autoUpdater.checkForUpdates().catch((e: Error) => send({ state: 'error', message: e.message }))
    },
    install: () => autoUpdater.quitAndInstall()
  }
}
