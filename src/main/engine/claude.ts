/**
 * Claude API 래퍼.
 * - structured(): 스트리밍 + structured outputs(zod) + 검증 실패 시 1회 교정 재시도
 * - research(): 서버 측 web_search 도구로 사전 조사 (선택)
 * - 모든 호출의 토큰 사용량을 모델별로 누적한다.
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { jsonrepair } from 'jsonrepair'
import { z } from 'zod'
import type { Effort, UsageSummary } from '../../shared/types'

type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
type BetaMessage = Anthropic.Beta.Messages.BetaMessage
type TextBlock = Anthropic.Beta.Messages.BetaTextBlockParam

/** 서버 측 거절 폴백("default")을 지원하는 모델 */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1'])

export interface McpServer {
  name: string
  url: string
  token?: string
}

export class PipelineCancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

export interface CallOptions {
  model: string
  system: TextBlock[]
  /** 텍스트, 또는 PDF·이미지가 섞인 블록 배열 */
  user: string | Anthropic.Beta.Messages.BetaContentBlockParam[]
  effort: Effort
  signal: AbortSignal
  maxTokens?: number
}

/**
 * structured outputs(문법 강제)는 스키마가 크면 서버가 "compiled grammar is too large"로 거절한다.
 * 그런 스키마는 JSON Schema를 프롬프트로 주고 앱이 직접 검증하는 JSON 모드로 보낸다.
 */
const JSON_MODE_OBJECT_LIMIT = 14
const jsonModeSchemas = new WeakSet<object>()
const jsonSchemaText = new WeakMap<object, string>()


const SUBMIT_TOOL = 'submit_result'

function schemaInfo(schema: z.ZodType): { text: string; objects: number; schemaObject: Record<string, unknown> } {
  let text = jsonSchemaText.get(schema)
  if (!text) {
    const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
    text = JSON.stringify(rest)
    jsonSchemaText.set(schema, text)
  }
  return { text, objects: (text.match(/"type":"object"/g) ?? []).length, schemaObject: JSON.parse(text) }
}

/**
 * structured outputs 형식만 넘긴다. SDK 헬퍼의 parse 함수까지 넘기면 SDK가 먼저 검증해
 * 예외를 던지므로(재시도 로직을 건너뜀), 검증은 아래에서 직접 한다.
 */
const formatCache = new WeakMap<object, { type: 'json_schema'; schema: Record<string, unknown> }>()
function outputFormat(schema: z.ZodType) {
  let f = formatCache.get(schema)
  if (!f) {
    const { type, schema: js } = betaZodOutputFormat(schema)
    f = { type, schema: js as Record<string, unknown> }
    formatCache.set(schema, f)
  }
  return f
}

const ENUM_SYNONYMS: Record<string, string> = {
  사실: 'fact', 추론: 'inference', 가설: 'hypothesis', 의견: 'opinion', 가정: 'hypothesis', assumption: 'hypothesis', estimate: 'inference', claim: 'opinion',
  높음: 'high', 중간: 'medium', 보통: 'medium', 낮음: 'low', 강함: 'strong', 약함: 'weak',
  승인: 'approve', 반려: 'rework', 유지: 'keep', 개선: 'improve'
}

/** enum 값 오류를 대소문자·한국어·동의어 기준으로 바로잡는다. 하나라도 고쳤으면 true */
function coerceEnums(root: unknown, err: z.ZodError): boolean {
  let fixed = false
  for (const issue of err.issues) {
    const values = (issue as { values?: unknown[] }).values
    if (issue.code !== 'invalid_value' || !Array.isArray(values) || !issue.path.length) continue
    let parent: any = root
    for (const k of issue.path.slice(0, -1)) parent = parent?.[k as never]
    const key = issue.path[issue.path.length - 1] as never
    const cur = parent?.[key]
    if (typeof cur !== 'string') continue
    const norm = cur.trim().toLowerCase()
    const options = values.map(String)
    const hit =
      options.find((o) => o.toLowerCase() === norm) ??
      options.find((o) => o === ENUM_SYNONYMS[cur.trim()] || o === ENUM_SYNONYMS[norm]) ??
      options.find((o) => norm.startsWith(o.toLowerCase()) || o.toLowerCase().startsWith(norm))
    if (hit) {
      parent[key] = hit
      fixed = true
    }
  }
  return fixed
}

/** zod 오류를 모델이 고치기 쉬운 짧은 목록으로 */
function zodIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 12)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join(' / ')
    .slice(0, 900)
}

/** 응답 텍스트에서 JSON 객체를 꺼낸다 (코드블록·앞뒤 문장 허용, 깨진 따옴표·쉼표는 복구) */
function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '')
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('JSON 객체가 없음')
  const raw = t.slice(a, b + 1)
  try {
    return JSON.parse(raw)
  } catch {
    return JSON.parse(jsonrepair(raw))
  }
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
    const info = schemaInfo(opts.schema)
    if (info.objects > JSON_MODE_OBJECT_LIMIT) jsonModeSchemas.add(opts.schema)
    // 큰 스키마는 "제출 도구"로 받는다: 모델이 도구 입력으로 결과를 넘기면 API가 JSON을 파싱해 준다.
    // (문법을 컴파일하지 않으므로 크기 한도가 없고, 문자열 속 따옴표로 JSON이 깨지지 않는다)
    const submitTool = () => ({
      name: SUBMIT_TOOL,
      description: '이 단계의 최종 결과를 제출한다. 반드시 이 도구 하나로, 스키마의 모든 required 필드를 채워 제출한다.',
      input_schema: info.schemaObject as Anthropic.Beta.Messages.BetaTool['input_schema']
    })
    const instruction = `\n\n결과는 텍스트로 쓰지 말고 반드시 ${SUBMIT_TOOL} 도구를 한 번 호출해 제출하라. 각 필드의 description을 지침으로 따른다.`
    const userContent = (): Anthropic.Beta.Messages.BetaMessageParam['content'] => {
      const base = typeof opts.user === 'string' ? [{ type: 'text' as const, text: opts.user }] : opts.user
      return jsonModeSchemas.has(opts.schema) ? [...base, { type: 'text' as const, text: instruction }] : base
    }
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: userContent() }]
    let lastError = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      const toolMode = jsonModeSchemas.has(opts.schema)
      const params = {
        ...this.baseParams(opts.model, opts.effort, opts.maxTokens ?? 32000),
        system: opts.system,
        messages,
        ...(toolMode
          ? { output_config: { effort: opts.effort }, tools: [submitTool()], tool_choice: { type: 'auto' } }
          : { output_config: { effort: opts.effort, format: outputFormat(opts.schema) } })
      } as BetaParams
      let msg: BetaMessage
      try {
        msg = await this.send(params, opts.signal)
      } catch (err) {
        // 문법 한도 초과 → 제출 도구 방식으로 전환해 처음부터 다시
        if (!toolMode && /grammar is too large|reduce the number of strict|schema is too (large|complex)/i.test((err as Error).message)) {
          jsonModeSchemas.add(opts.schema)
          messages.splice(0, messages.length, { role: 'user', content: userContent() })
          attempt--
          continue
        }
        throw err
      }

      if (msg.stop_reason === 'refusal') {
        throw new Error(`모델이 요청을 거절했습니다${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ''}.`)
      }
      const text = msg.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      const toolUse = msg.content.find(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use' && b.name === SUBMIT_TOOL
      )

      let candidate: unknown
      if (msg.stop_reason === 'max_tokens') {
        lastError = '출력이 최대 길이에서 잘렸습니다. 같은 구조로 더 간결하게 다시 작성하라.'
      } else {
        try {
          candidate = toolUse ? toolUse.input : toolMode ? extractJson(text) : JSON.parse(text)
        } catch {
          lastError = toolMode ? `${SUBMIT_TOOL} 도구로 제출하지 않았다.` : 'JSON 파싱 실패. 스키마에 맞는 JSON만 출력하라.'
        }
      }
      if (candidate !== undefined) {
        let parsed = opts.schema.safeParse(candidate)
        // 분류값(enum) 표기만 틀린 경우는 재요청 없이 바로잡는다 (예: "사실" → fact, "Inference" → inference)
        if (!parsed.success && coerceEnums(candidate, parsed.error)) parsed = opts.schema.safeParse(candidate)
        if (parsed.success) {
          const problem = opts.validate?.(parsed.data) ?? null
          if (!problem) return parsed.data
          lastError = problem
        } else {
          lastError = `스키마 검증 실패: ${zodIssues(parsed.error)}`
        }
      }
      // 이전 응답을 그대로 이어 붙인다(append-only: thinking 블록 보존).
      messages.push({ role: 'assistant', content: msg.content as never })
      const fix = `제출한 결과에 문제가 있다: ${lastError}\n전체 결과를 다시 ${toolMode ? `${SUBMIT_TOOL} 도구로 ` : ''}제출하라.`
      messages.push({
        role: 'user',
        content: toolUse ? [{ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: fix }] : fix
      })
    }
    throw new Error(`구조화 출력 실패: ${lastError}`)
  }

  /**
   * Factbook 조사. web=true면 서버 측 웹 검색을, mcp가 있으면 원격 MCP 서버 도구를 쓴다.
   * 출처 URL을 포함한 메모를 반환한다.
   */
  async research(opts: CallOptions, web = true, mcp: McpServer[] = []): Promise<string> {
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: opts.user }]
    const sources = new Map<string, string>()
    let notes = ''
    for (let turn = 0; turn < 4; turn++) {
      const params = {
        ...this.baseParams(opts.model, opts.effort, opts.maxTokens ?? 16000),
        system: opts.system,
        messages,
        tools: [
          ...(web ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }] : []),
          ...mcp.map((m) => ({ type: 'mcp_toolset', mcp_server_name: m.name }))
        ],
        ...(mcp.length
          ? {
              mcp_servers: mcp.map((m) => ({ type: 'url', url: m.url, name: m.name, ...(m.token ? { authorization_token: m.token } : {}) })),
              betas: [...((this.baseParams(opts.model, opts.effort, 0).betas as string[]) ?? []), 'mcp-client-2025-11-20']
            }
          : {})
      } as BetaParams
      if (!(params.tools as unknown[]).length) delete (params as { tools?: unknown }).tools
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

  /**
   * Anthropic pptx 스킬로 리포트를 PPT 덱으로 만든다 (코드 실행 컨테이너).
   * 생성된 파일은 Files API로 내려받는다.
   */
  async pptxDeck(model: string, markdown: string, title: string, signal?: AbortSignal): Promise<{ name: string; data: Buffer }> {
    const container: { skills: { type: 'anthropic'; skill_id: string; version: string }[]; id?: string } = {
      skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }]
    }
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      {
        role: 'user',
        content: `아래 기획 리포트로 경영진 보고용 PPT 덱(16:9, 12~18장)을 만들어 "${title.replace(/"/g, '')}.pptx"로 저장하라.
구성: 표지 → 요약 → 코어(목표·목적·브랜드·소비자·시장) → MIN'S 4-3-2 THINKING → 대안별 1~2장 → 비교표 → 조건부 추천 → 다음 검증.
디자인: 흰 배경, 큰 타이포그래피, 넉넉한 여백, 강조색은 #FF3FA4 하나만, 색 바탕 박스·왼쪽 컬러 보더 금지. 한 장에 메시지 하나.
한국어로 작성한다.

<report>
${markdown}
</report>`
      }
    ]
    const fileIds = new Set<string>()
    const collect = (v: unknown): void => {
      if (!v || typeof v !== 'object') return
      if (Array.isArray(v)) return v.forEach(collect)
      for (const [k, val] of Object.entries(v)) {
        if (k === 'file_id' && typeof val === 'string') fileIds.add(val)
        else collect(val)
      }
    }
    for (let turn = 0; turn < 6; turn++) {
      const params = {
        model,
        max_tokens: 32000,
        betas: ['code-execution-2025-08-25'],
        container,
        tools: [{ type: 'code_execution_20260521', name: 'code_execution' }],
        output_config: { effort: 'medium' },
        messages
      } as unknown as BetaParams
      const msg = await this.send(params, signal ?? new AbortController().signal)
      collect(msg.content)
      const c = (msg as unknown as { container?: { id: string } }).container
      if (c?.id) container.id = c.id
      if (msg.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: msg.content as never })
    }
    for (const id of fileIds) {
      try {
        const meta = await this.client.files.retrieveMetadata(id)
        if (!/\.pptx$/i.test(meta.filename)) continue
        const res = await this.client.files.download(id)
        return { name: meta.filename, data: Buffer.from(await res.arrayBuffer()) }
      } catch {
        /* 다음 파일 시도 */
      }
    }
    throw new Error('PPT 파일을 받지 못했습니다. 잠시 후 다시 시도하세요.')
  }
}
