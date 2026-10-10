/**
 * 첨부 파일 → MPM이 읽을 수 있는 자료(Material)로 변환.
 * - PDF · 이미지: Claude가 직접 본다 (document / image 블록)
 * - PPTX · DOCX · XLSX: 텍스트·표로 추출
 * - MD · TXT · CSV · JSON · 코드: 텍스트 그대로
 * - ZIP: 안의 파일을 위 규칙으로 하나씩 처리 (중첩 ZIP은 건너뜀)
 */
import { nativeImage } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import type { Material } from './types'

export const LIMITS = {
  files: 5,
  fileBytes: 30 * 1024 * 1024,
  textChars: 40_000,
  zipEntries: 40,
  zipEntryBytes: 8 * 1024 * 1024,
  imageMaxSide: 1568,
  sheetRows: 300
}

const TEXT_EXT = new Set([
  '.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.yml', '.yaml', '.xml', '.html', '.htm', '.log',
  '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.kt', '.swift', '.go', '.rb', '.php', '.cs', '.c', '.cpp', '.h',
  '.css', '.scss', '.sql', '.sh', '.toml', '.ini', '.env.example', '.gradle', '.vue', '.svelte'
])
const IMAGE_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

export const ACCEPTED_EXTENSIONS = ['md', 'markdown', 'txt', 'csv', 'json', 'pdf', 'pptx', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'zip']

const clip = (s: string, n = LIMITS.textChars) => (s.length > n ? `${s.slice(0, n)}\n…(이하 ${(s.length - n).toLocaleString()}자 생략)` : s)
const xmlText = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g'))]
    .map((m) => m[1])
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

function image(buf: Buffer, source: string, mediaType: string): Material {
  // 큰 이미지는 Claude 권장 크기로 줄인다
  let img = nativeImage.createFromBuffer(buf)
  const { width, height } = img.getSize()
  if (!img.isEmpty() && Math.max(width, height) > LIMITS.imageMaxSide) {
    const k = LIMITS.imageMaxSide / Math.max(width, height)
    img = img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'good' })
    return { source, kind: 'image', image: { mediaType: 'image/jpeg', data: img.toJPEG(85).toString('base64') } }
  }
  return { source, kind: 'image', image: { mediaType, data: buf.toString('base64') } }
}

async function pptx(buf: Buffer, source: string): Promise<Material> {
  const zip = await JSZip.loadAsync(buf)
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  const parts: string[] = []
  for (const [i, p] of slides.entries()) {
    const text = xmlText(await zip.file(p)!.async('string'), 'a:t')
    const notesPath = `ppt/notesSlides/notesSlide${p.match(/\d+/)![0]}.xml`
    const notes = zip.file(notesPath) ? xmlText(await zip.file(notesPath)!.async('string'), 'a:t') : ''
    parts.push(`[슬라이드 ${i + 1}] ${text}${notes ? `\n  (노트) ${notes}` : ''}`)
  }
  return { source, kind: 'text', text: clip(parts.join('\n')), note: `PPTX ${slides.length}장` }
}

async function docx(buf: Buffer, source: string): Promise<Material> {
  const zip = await JSZip.loadAsync(buf)
  const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''
  const paragraphs = xml.split(/<\/w:p>/).map((p) => xmlText(p, 'w:t')).filter((t) => t.trim())
  return { source, kind: 'text', text: clip(paragraphs.join('\n')), note: `DOCX ${paragraphs.length}문단` }
}

async function xlsx(buf: Buffer, source: string): Promise<Material> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const out: string[] = []
  wb.eachSheet((sheet) => {
    out.push(`## 시트: ${sheet.name} (${sheet.rowCount}행)`)
    let n = 0
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (n++ >= LIMITS.sheetRows) return
      const cells = (row.values as unknown[]).slice(1).map((v) => {
        if (v === null || v === undefined) return ''
        if (typeof v === 'object') {
          const o = v as { result?: unknown; text?: string; richText?: { text: string }[] }
          if (o.richText) return o.richText.map((r) => r.text).join('')
          if (o.text) return o.text
          if (o.result !== undefined) return String(o.result)
          if (v instanceof Date) return v.toISOString().slice(0, 10)
        }
        return String(v)
      })
      out.push(cells.map((c) => c.replace(/\t|\n/g, ' ')).join('\t'))
    })
    if (sheet.rowCount > LIMITS.sheetRows) out.push(`…(${sheet.rowCount - LIMITS.sheetRows}행 생략)`)
  })
  return { source, kind: 'text', text: clip(out.join('\n')), note: `XLSX ${wb.worksheets.length}시트` }
}

/** 버퍼 하나를 확장자에 맞게 변환. ZIP 안에서도 재사용한다. */
async function fromBuffer(buf: Buffer, source: string, depth = 0): Promise<Material[]> {
  const ext = extname(source).toLowerCase()
  if (ext === '.pdf') return [{ source, kind: 'pdf', pdf: buf.toString('base64'), note: `PDF ${(buf.length / 1024 / 1024).toFixed(1)}MB` }]
  if (IMAGE_EXT[ext]) return [image(buf, source, IMAGE_EXT[ext])]
  if (ext === '.pptx') return [await pptx(buf, source)]
  if (ext === '.docx') return [await docx(buf, source)]
  if (ext === '.xlsx') return [await xlsx(buf, source)]
  if (ext === '.zip') {
    if (depth > 0) return [{ source, kind: 'text', text: '(중첩 ZIP은 열지 않음)' }]
    return fromZip(buf, source)
  }
  if (TEXT_EXT.has(ext) || ext === '') {
    const text = buf.toString('utf8')
    if (text.includes('\u0000')) return [] // 바이너리
    return [{ source, kind: 'text', text: clip(text) }]
  }
  return []
}

async function fromZip(buf: Buffer, source: string): Promise<Material[]> {
  const zip = await JSZip.loadAsync(buf)
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && !f.name.startsWith('__MACOSX/') && !basename(f.name).startsWith('.') && !/node_modules\/|\.git\//.test(f.name)
  )
  const tree = entries.map((f) => f.name).slice(0, 400).join('\n')
  const out: Material[] = [{ source: `${source} (목록)`, kind: 'text', text: `ZIP 안의 파일 ${entries.length}개:\n${tree}` }]
  let used = 0
  for (const f of entries) {
    if (used >= LIMITS.zipEntries) {
      out.push({ source: `${source} (생략)`, kind: 'text', text: `파일이 많아 ${entries.length - used}개는 내용을 읽지 않았습니다.` })
      break
    }
    const data = await f.async('nodebuffer')
    if (data.length > LIMITS.zipEntryBytes) continue
    const items = await fromBuffer(data, `${source}/${f.name}`, 1).catch(() => [])
    if (items.length) {
      out.push(...items)
      used++
    }
  }
  return out
}

export async function readAttachment(path: string): Promise<Material[]> {
  const s = await stat(path)
  if (s.size > LIMITS.fileBytes) throw new Error(`${basename(path)}: ${LIMITS.fileBytes / 1024 / 1024}MB를 넘습니다`)
  const items = await fromBuffer(await readFile(path), basename(path))
  if (!items.length) throw new Error(`${basename(path)}: 지원하지 않는 형식입니다`)
  return items
}
