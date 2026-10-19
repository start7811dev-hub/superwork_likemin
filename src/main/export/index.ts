/**
 * 내보내기 레지스트리. 새 형식은 EXPORTERS에 항목 하나만 추가하면 UI/IPC에 자동 반영된다.
 */
import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { marked } from 'marked'
import type { ExportFormat, RunRecord } from '../../shared/types'
import { factbookToMarkdown, runToMarkdown, runToMarkdownFull } from '../../shared/report-md'

interface Exporter {
  ext: string
  label: string
  render(run: RunRecord): Promise<string | Buffer>
}

export function runToHtml(run: RunRecord): string {
  const body = marked.parse(runToMarkdown(run), { async: false }) as string
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${run.title.replace(/</g, '&lt;')}</title>
<style>
  :root{--ink:#1f2328;--muted:#6b7079;--line:#e3e5e8;--accent:#ee7d2b;--bg:#f6f6f4}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 "Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif}
  main{max-width:860px;margin:0 auto;padding:48px 32px;background:#fff;min-height:100vh}
  h1{font-size:28px;letter-spacing:-.02em;margin:0 0 8px}
  h2{font-size:19px;margin:40px 0 12px;padding-top:16px;border-top:1px solid var(--line)}
  h3{font-size:16px;margin:28px 0 8px}
  h3 code{background:#fff3e8;color:var(--accent);border-radius:4px;padding:1px 6px;font-size:12px}
  blockquote{margin:0 0 24px;color:var(--muted);font-size:13px;border-left:3px solid var(--accent);padding-left:12px}
  table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}
  th,td{border:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}
  th{background:#fafafa}
  @media print{body{background:#fff}main{padding:0}h2{break-after:avoid}}
</style></head><body><main>${body}</main></body></html>`
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, javascript: false } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
  } finally {
    win.destroy()
  }
}

export const EXPORTERS: Record<Exclude<ExportFormat, 'pptx'>, Exporter> = {
  md: { ext: 'md', label: 'Markdown (핵심본)', render: async (r) => runToMarkdown(r) },
  'md-full': { ext: 'md', label: 'Markdown (전체본)', render: async (r) => runToMarkdownFull(r) },
  html: { ext: 'html', label: 'HTML', render: async (r) => runToHtml(r) },
  json: { ext: 'json', label: 'JSON (원본 데이터)', render: async (r) => JSON.stringify(r, null, 2) },
  pdf: { ext: 'pdf', label: 'PDF', render: async (r) => htmlToPdf(runToHtml(r)) },
  factbook: { ext: 'md', label: 'Factbook (Markdown)', render: async (r) => (r.factbook ? `${factbookToMarkdown(r.factbook, `# Factbook — ${r.title}`)}\n` : '# Factbook 없음\n') }
}

/** 저장 위치를 묻고 데이터를 쓴다. PPTX처럼 미리 만든 데이터도 이걸로 저장한다. */
export async function saveFile(win: BrowserWindow | null, defaultName: string, ext: string, label: string, data: string | Buffer) {
  const opts = { defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return { ok: false }
  writeFileSync(res.filePath, data)
  return { ok: true, path: res.filePath }
}

export async function saveExport(win: BrowserWindow | null, run: RunRecord, format: Exclude<ExportFormat, 'pptx'>) {
  const ex = EXPORTERS[format]
  const safe = run.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
  const opts = { defaultPath: `${safe}${format === 'factbook' ? '-factbook' : ''}.${ex.ext}`, filters: [{ name: ex.label, extensions: [ex.ext] }] }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return { ok: false }
  writeFileSync(res.filePath, await ex.render(run))
  return { ok: true, path: res.filePath }
}
