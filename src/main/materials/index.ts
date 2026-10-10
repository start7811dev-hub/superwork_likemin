/**
 * 업무 지시에 딸린 참고 자료(첨부 파일 + 링크)를 모아 Claude에 넘길 형태로 만든다.
 * - 맥락 설계(MPM): PDF · 이미지까지 포함한 전체 자료
 * - 이후 단계: 텍스트 자료(시스템 프롬프트에 캐시) + 캔버스의 자료 요약
 */
import type Anthropic from '@anthropic-ai/sdk'
import { readAttachment, LIMITS } from './files'
import { extractUrls, readLink } from './links'
import type { Material } from './types'

type Block = Anthropic.Beta.Messages.BetaContentBlockParam

export interface CollectedMaterials {
  items: Material[]
  errors: string[]
}

export async function collectMaterials(paths: string[], brief: string, onProgress: (msg: string) => void): Promise<CollectedMaterials> {
  const items: Material[] = []
  const errors: string[] = []
  for (const p of paths.slice(0, LIMITS.files)) {
    try {
      const got = await readAttachment(p)
      items.push(...got)
      onProgress(`첨부 읽음: ${got[0].source}${got.length > 1 ? ` 외 ${got.length - 1}개 항목` : ''}`)
    } catch (err) {
      errors.push((err as Error).message)
    }
  }
  for (const url of extractUrls(brief)) {
    try {
      onProgress(`링크 여는 중: ${url}`)
      items.push(...(await readLink(url)))
    } catch (err) {
      errors.push(`${url}: ${(err as Error).message}`)
    }
  }
  // Claude 요청 한도 보호: PDF 최대 4개, 이미지 최대 12장
  let pdfs = 0
  let images = 0
  const kept = items.filter((m) => (m.kind === 'pdf' ? ++pdfs <= 4 : m.kind === 'image' ? ++images <= 12 : true))
  if (kept.length < items.length) errors.push(`자료가 많아 PDF ${Math.max(0, pdfs - 4)}개, 이미지 ${Math.max(0, images - 12)}장은 제외했습니다`)
  return { items: kept, errors }
}

/** 맥락 설계 단계에 넘길 멀티모달 블록 */
export function toBlocks(items: Material[]): Block[] {
  const blocks: Block[] = []
  for (const m of items) {
    if (m.kind === 'pdf' && m.pdf) {
      blocks.push({ type: 'text', text: `<material source="${m.source}">` })
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: m.pdf }, title: m.source })
      blocks.push({ type: 'text', text: '</material>' })
    } else if (m.kind === 'image' && m.image) {
      blocks.push({ type: 'text', text: `<material source="${m.source}">` })
      blocks.push({ type: 'image', source: { type: 'base64', media_type: m.image.mediaType as 'image/png', data: m.image.data } })
      blocks.push({ type: 'text', text: '</material>' })
    }
  }
  const text = textDigest(items, 150_000)
  if (text) blocks.push({ type: 'text', text })
  return blocks
}

/** 텍스트 자료만 묶은 것 (이후 단계 공유용) */
export function textDigest(items: Material[], maxChars = 80_000): string {
  const texts = items.filter((m) => m.kind === 'text' && m.text)
  if (!texts.length) return ''
  let budget = maxChars
  const parts: string[] = []
  for (const m of texts) {
    if (budget <= 0) {
      parts.push(`<material source="${m.source}">(분량 한도로 생략)</material>`)
      continue
    }
    const body = m.text!.slice(0, budget)
    budget -= body.length
    parts.push(`<material source="${m.source}">\n${body}\n</material>`)
  }
  return `<reference_materials>\n${parts.join('\n')}\n</reference_materials>`
}

export { extractUrls }
