/**
 * Claude API 래퍼.
 * - structured(): 스트리밍 + structured outputs(zod) + 검증 실패 시 1회 교정 재시도
 * - research(): 서버 측 web_search 도구로 사전 조사 (선택)
 * - 모든 호출의 토큰 사용량을 모델별로 누적한다.
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import type { Effort, UsageSummary } from '../../shared/types'

type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
type BetaMessage = Anthropic.Beta.Messages.BetaMessage
type TextBlock = Anthropic.Beta.Messages.BetaTextBlockParam

/** 서버 측 거절 폴백("default")을 지원하는 모델 */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1'])

export class PipelineCancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

export interface CallOptions {
  model: string
  system: TextBlock[]
  user: string
  effort: Effort
  signal: AbortSignal
  maxTokens?: number
}

export class ClaudeEngine {
  private client: Anthropic
  readonly usage: UsageSummary = {}

  constructor(
    apiKey: string,
    private onUsage: (u: UsageSummary) => void
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 4 })
  }

  private track(msg: BetaMessage): void {
    const u = msg.usage
    const m = (this.usage[msg.model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 })
    m.input += u.input_tokens
    m.output += u.output_tokens
    m.cacheRead += u.cache_read_input_tokens ?? 0
    m.cacheWrite += u.cache_creation_input_tokens ?? 0
    m.calls += 1
    this.onUsage(this.usage)
  }

  private baseParams(model: string, effort: Effort, maxTokens: number): Partial<BetaParams> {
    const p: Partial<BetaParams> = { model, max_tokens: maxTokens, thinking: { type: 'adaptive' } }
    if (FALLBACK_MODELS.has(model)) {
      p.betas = ['server-side-fallback-2026-07-01']
      p.fallbacks = 'default'
    }
    p.output_config = { effort }
    return p
  }

  private async send(params: BetaParams, signal: AbortSignal): Promise<BetaMessage> {
    try {
      const msg = await this.client.beta.messages.stream(params, { signal }).finalMessage()
      this.track(msg)
      return msg
    } catch (err) {
      if (signal.aborted || err instanceof Anthropic.APIUserAbortError) throw new PipelineCancelled()
      if (err instanceof Anthropic.AuthenticationError) throw new Error('API 키 인증에 실패했습니다. 설정에서 키를 확인하세요.')
      if (err instanceof Anthropic.RateLimitError) throw new Error('요청 한도를 초과했습니다. 잠시 후 다시 시도하거나 동시 실행 수를 줄이세요.')
      if (err instanceof Anthropic.APIConnectionError) throw new Error('Claude API에 연결할 수 없습니다. 네트워크를 확인하세요.')
      if (err instanceof Anthropic.APIError) throw new Error(`Claude API 오류 (${err.status}): ${err.message}`)
      throw err
    }
  }

  /** 스키마를 강제한 JSON 출력. 실패 시 대화를 이어 붙여(append-only) 1회 교정한다. */
  async structured<S extends z.ZodType>(
    opts: CallOptions & { schema: S; validate?: (v: z.infer<S>) => string | null }
  ): Promise<z.infer<S>> {
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: opts.user }]
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const params = {
        ...this.baseParams(opts.model, opts.effort, opts.maxTokens ?? 32000),
        system: opts.system,
        messages,
        output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) }
      } as BetaParams
      const msg = await this.send(params, opts.signal)

      if (msg.stop_reason === 'refusal') {
        throw new Error(`모델이 요청을 거절했습니다${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ''}.`)
      }
      const text = msg.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      if (msg.stop_reason === 'max_tokens') {
        lastError = '출력이 최대 길이에서 잘렸습니다. 같은 구조로 더 간결하게 다시 작성하라.'
      } else {
        try {
          const parsed = opts.schema.safeParse(JSON.parse(text))
          if (parsed.success) {
            const problem = opts.validate?.(parsed.data) ?? null
            if (!problem) return parsed.data
            lastError = problem
          } else {
            lastError = `스키마 검증 실패: ${parsed.error.message.slice(0, 500)}`
          }
        } catch {
          lastError = 'JSON 파싱 실패. 스키마에 맞는 JSON만 출력하라.'
        }
      }
      // 이전 응답을 그대로 이어 붙인다(append-only: thinking 블록 보존).
      messages.push({ role: 'assistant', content: msg.content as never })
      messages.push({ role: 'user', content: `출력에 문제가 있다: ${lastError}\n전체 결과를 다시 출력하라.` })
    }
    throw new Error(`구조화 출력 실패: ${lastError}`)
  }

  /** Factbook 조사. web=true면 서버 측 웹 검색을 쓰고, 출처 URL을 포함한 메모를 반환한다. */
  async research(opts: CallOptions, web = true): Promise<string> {
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: opts.user }]
    const sources = new Map<string, string>()
    let notes = ''
    for (let turn = 0; turn < 4; turn++) {
      const params = {
        ...this.baseParams(opts.model, opts.effort, opts.maxTokens ?? 16000),
        system: opts.system,
        messages,
        ...(web ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }] } : {})
      } as BetaParams
      const msg = await this.send(params, opts.signal)
      for (const block of msg.content) {
        if (block.type === 'text') notes += block.text
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === 'web_search_result') sources.set(r.url, r.title)
        }
      }
      if (msg.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: msg.content as never })
    }
    const srcList = [...sources.entries()].map(([url, title]) => `- ${title} — ${url}`).join('\n')
    const caveat = web ? '' : '\n\n[주의] 웹 검색 없이 모델 지식으로 작성됨 — 시점이 오래됐을 수 있으니 reliability를 보수적으로 매길 것.'
    return `${notes.trim()}\n\n[검색된 출처]\n${srcList || '- (없음)'}${caveat}`
  }
}
