import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { LikeMinApi, PipelineEvent, UpdateStatus } from '../shared/types'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const handler = (_e: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: LikeMinApi = {
  app: { version: () => invoke('app:version') },
  settings: {
    get: () => invoke('settings:get'),
    save: (s) => invoke('settings:save', s),
    setKey: (k) => invoke('settings:setKey', k),
    clearKey: () => invoke('settings:clearKey')
  },
  files: {
    pick: () => invoke('files:pick'),
    pathFor: (file) => webUtils.getPathForFile(file),
    info: (paths) => invoke('files:info', paths)
  },
  links: {
    login: (url) => invoke('links:login', url),
    clearSessions: () => invoke('links:clearSessions')
  },
  secrets: {
    has: (name) => invoke('secrets:has', name),
    set: (name, value) => invoke('secrets:set', name, value)
  },
  cost: {
    get: (force) => invoke('cost:get', force),
    setAdminKey: (k) => invoke('cost:setAdminKey', k),
    hasAdminKey: () => invoke('cost:hasAdminKey'),
    report: () => invoke('cost:report')
  },
  brain: {
    get: () => invoke('brain:get'),
    saveDoctrine: (t) => invoke('brain:saveDoctrine', t),
    saveRoster: (r) => invoke('brain:saveRoster', r),
    addKnowledge: (n, c) => invoke('brain:addKnowledge', n, c),
    importKnowledge: () => invoke('brain:importKnowledge'),
    removeKnowledge: (n) => invoke('brain:removeKnowledge', n),
    removeMemory: (id) => invoke('brain:removeMemory', id),
    openFolder: () => invoke('brain:openFolder')
  },
  runs: {
    list: () => invoke('runs:list'),
    get: (id) => invoke('runs:get', id),
    remove: (id) => invoke('runs:remove', id),
    start: (brief, depth, demo, attachments, now) => invoke('runs:start', brief, depth, demo, attachments, now),
    cancel: (id) => invoke('runs:cancel', id),
    answer: (id, a) => invoke('runs:answer', id, a),
    feedback: (id, chosen, note) => invoke('runs:feedback', id, chosen, note),
    onEvent: (cb) => subscribe<PipelineEvent>('runs:event', cb)
  },
  exporter: {
    save: (id, f) => invoke('export:save', id, f),
    markdown: (id) => invoke('export:markdown', id)
  },
  integrations: {
    list: () => invoke('integrations:list'),
    send: (id, runId) => invoke('integrations:send', id, runId),
    openPluginFolder: () => invoke('integrations:openPluginFolder')
  },
  updater: {
    check: () => invoke('updater:check'),
    install: () => invoke('updater:install'),
    onStatus: (cb) => subscribe<UpdateStatus>('updater:status', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
