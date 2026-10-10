import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Depth, ExportFormat, RoleDef, Settings } from '../shared/types'
import { runToMarkdown } from '../shared/report-md'
import {
  addKnowledge,
  loadBrain,
  removeKnowledge,
  removeMemoryItem,
  saveDoctrine,
  saveMemoryItem,
  saveRoster
} from './brain/loader'
import { answerRun, cancelRun, startRun } from './engine/pipeline'
import { saveExport } from './export'
import { listIntegrations, pluginDirs, sendIntegration } from './integrations'
import { clearApiKey, getApiKey, loadSettings, saveSettings, setApiKey } from './settings'
import { getRun, listRuns, recoverInterrupted, removeRun, saveRun } from './store/runs'
import { initUpdater } from './updater'
import { getCostStatus, hasAdminKey, setAdminKey } from './cost'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'SUPER WORK – LIKE MIN',
    backgroundColor: '#ECEDEF',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerIpc(): void {
  const updater = initUpdater(() => win)
  const mustRun = (id: string) => {
    const r = getRun(id)
    if (!r) throw new Error('실행 기록을 찾을 수 없습니다.')
    return r
  }

  ipcMain.handle('app:version', () => app.getVersion())

  /* 설정 */
  ipcMain.handle('settings:get', () => {
    const k = getApiKey()
    return { settings: loadSettings(), hasKey: !!k.key, keySource: k.source }
  })
  ipcMain.handle('settings:save', (_e, s: Settings) => saveSettings(s))
  ipcMain.handle('settings:setKey', (_e, key: string) => setApiKey(key))
  ipcMain.handle('settings:clearKey', () => clearApiKey())

  /* 비용 */
  ipcMain.handle('cost:get', (_e, force?: boolean) => getCostStatus(force))
  ipcMain.handle('cost:setAdminKey', (_e, key: string | null) => setAdminKey(key))
  ipcMain.handle('cost:hasAdminKey', () => hasAdminKey())

  /* 두뇌 */
  ipcMain.handle('brain:get', () => loadBrain())
  ipcMain.handle('brain:saveDoctrine', (_e, t: string | null) => saveDoctrine(t))
  ipcMain.handle('brain:saveRoster', (_e, r: RoleDef[] | null) => saveRoster(r))
  ipcMain.handle('brain:addKnowledge', (_e, name: string, content: string) => addKnowledge(name, content))
  ipcMain.handle('brain:removeKnowledge', (_e, name: string) => removeKnowledge(name))
  ipcMain.handle('brain:removeMemory', (_e, id: string) => removeMemoryItem(id))
  ipcMain.handle('brain:openFolder', () => shell.openPath(loadBrain().userDir))
  ipcMain.handle('brain:importKnowledge', async () => {
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown / Text', extensions: ['md', 'txt'] }]
    })
    for (const p of res.filePaths) addKnowledge(basename(p).replace(/\.txt$/, '.md'), readFileSync(p, 'utf8'))
    return res.filePaths.length
  })

  /* 실행 */
  ipcMain.handle('runs:list', () => listRuns())
  ipcMain.handle('runs:get', (_e, id: string) => getRun(id))
  ipcMain.handle('runs:remove', (_e, id: string) => removeRun(id))
  ipcMain.handle('runs:cancel', (_e, id: string) => cancelRun(id))
  ipcMain.handle('runs:answer', (_e, id: string, a: string[] | null) => answerRun(id, a))
  ipcMain.handle('runs:start', (_e, brief: string, depth: Depth, demo?: boolean) => {
    const { key } = getApiKey()
    if (!key && !demo) throw new Error('먼저 설정에서 Claude API 키를 등록하세요.')
    return startRun({
      apiKey: demo ? null : key,
      settings: loadSettings(),
      brief,
      depth,
      emit: (ev) => win?.webContents.send('runs:event', ev)
    })
  })
  ipcMain.handle('runs:feedback', (_e, id: string, chosen: string, note: string) => {
    const r = mustRun(id)
    r.feedback = { chosen, note, at: new Date().toISOString() }
    saveRun(r)
    saveMemoryItem({ runId: r.id, title: r.title, chosen, note, at: r.feedback.at })
  })

  /* 내보내기 / 연동 */
  ipcMain.handle('export:save', (_e, id: string, format: ExportFormat) => saveExport(win, mustRun(id), format))
  ipcMain.handle('export:markdown', (_e, id: string) => runToMarkdown(mustRun(id)))
  ipcMain.handle('integrations:list', () => listIntegrations())
  ipcMain.handle('integrations:send', (_e, id: string, runId: string) =>
    sendIntegration(id, mustRun(runId), loadSettings().integrations[id] ?? {})
  )
  ipcMain.handle('integrations:openPluginFolder', () => shell.openPath(pluginDirs()[1]))

  /* 업데이트 */
  ipcMain.handle('updater:check', () => updater.check())
  ipcMain.handle('updater:install', () => updater.install())
}

/** 개발용: 데모를 자동 실행하며 시점별 화면을 저장한다 (SWLM_SHOT_DIR=폴더) */
async function devCapture(dir: string): Promise<void> {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(dir, { recursive: true })
  win!.webContents.on('console-message', (_e, level, message) => level >= 2 && console.log('[renderer]', message))
  win!.webContents.on('render-process-gone', (_e, d) => console.log('[renderer gone]', d.reason))
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  await wait(2500)
  const shot = async (name: string) => {
    const img = await win!.webContents.capturePage()
    writeFileSync(join(dir, `${name}.png`), img.toPNG())
  }
  await shot('0-idle')
  const id = startRun({ apiKey: null, settings: loadSettings(), brief: '30대 직장인 대상 구독형 밀키트 서비스 초기 고객 확보 전략', depth: 'standard', emit: (ev) => win?.webContents.send('runs:event', ev) })
  await wait(5000)
  await shot('1-question')
  answerRun(id, ['매주 오는 단골을 만드는 게 목표'])
  for (const [t, name] of [[11000, '2-factbook'], [12000, '3-audit'], [19000, '4-synth'], [10000, '5-review'], [9000, '6-clone'], [14000, '7-done']] as const) {
    await wait(t)
    await shot(name)
  }
  const click = (label: string, scope = 'button') =>
    win!.webContents.executeJavaScript(`var b = [...document.querySelectorAll(${JSON.stringify(scope)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); !!b`)
  const scrollTo = (sel: string) => win!.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'start' })`)
  await click('리포트', '.views button')
  await wait(1500)
  await shot('8-report')
  await click('SUPER INSIGHT', '.doc-tabs button')
  await wait(1000)
  await shot('9-insight')
  for (const [i, name] of [[2, '10-jtbd'], [3, '11-aarrr'], [4, '12-tows'], [5, '13-stp'], [6, '14-unit'], [7, '15-competition']] as const) {
    await scrollTo(`.strategy > .viz:nth-of-type(${i})`)
    await wait(600)
    await shot(name)
  }
  await click('Factbook', '.doc-tabs button')
  await wait(800)
  await shot('16-factbook')
  app.quit()
}

// 개발용 캡처는 임시 데이터 폴더에서 돌려 실제 기록·비용 집계에 섞이지 않게 한다
if (process.env.SWLM_SHOT_DIR) app.setPath('userData', join(process.env.SWLM_SHOT_DIR, '.userdata'))

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })
  app.whenReady().then(() => {
    recoverInterrupted()
    registerIpc()
    createWindow()
    if (process.env.SWLM_SHOT_DIR) void devCapture(process.env.SWLM_SHOT_DIR)
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
  })
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
}
