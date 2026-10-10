/**
 * 업무 툴 연동 레지스트리.
 *
 * 1) 내장 연동(코드): Slack, Notion, NAVER WORKS, Webhook, Email
 * 2) 선언형 플러그인(JSON): plugins/integrations/*.json (번들) + userData/plugins/*.json (사용자)
 *    → 코드 실행 없이 HTTP 요청 템플릿만 정의하므로 안전하게 확장할 수 있다.
 *
 * 플러그인 형식 예: plugins/integrations/discord.json 참고
 *   { id, name, description, fields:[{key,label,secret}], request:{ method, url, headers, body } }
 *   문자열 안의 {{변수}}가 치환된다. 값 전체가 "{{변수}}"이면 원래 타입(객체 등) 그대로 들어간다.
 *   변수: title, summary, recommendation, markdown, markdownShort, report(전체 JSON), createdAt, 필드 key
 */
import { shell } from 'electron'
import { createSign } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IntegrationField, IntegrationInfo, RunRecord } from '../../shared/types'
import { runToMarkdown } from '../../shared/report-md'
import { resourceDir, userDir } from '../paths'

type Result = { ok: boolean; message: string; url?: string }
type Config = Record<string, string>

interface Integration extends IntegrationInfo {
  send(run: RunRecord, config: Config): Promise<Result>
}

function requireFields(fields: IntegrationField[], config: Config): string | null {
  const missing = fields.filter((f) => !config[f.key]?.trim()).map((f) => f.label)
  return missing.length ? `설정에서 입력하세요: ${missing.join(', ')}` : null
}

function assertUrl(raw: string): URL {
  const u = new URL(raw)
  const local = ['localhost', '127.0.0.1'].includes(u.hostname)
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('https URL만 허용됩니다.')
  return u
}

function vars(run: RunRecord): Record<string, unknown> {
  const md = runToMarkdown(run)
  const s = run.synthesis
  const pick = s?.alternatives.find((a) => a.id === s.recommendation.pick)
  return {
    title: run.title,
    createdAt: run.createdAt,
    summary: s?.executiveSummary ?? run.brief,
    recommendation: s ? `${s.recommendation.pick}. ${pick?.name ?? ''} — ${s.recommendation.rationale}` : '',
    markdown: md,
    markdownShort: md.length > 1800 ? `${md.slice(0, 1800)}…` : md,
    report: run
  }
}

function fill(template: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof template === 'string') {
    const whole = template.match(/^\{\{\s*([\w.]+)\s*\}\}$/)
    if (whole) return ctx[whole[1]] ?? ''
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
      const v = ctx[k]
      return v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v)
    })
  }
  if (Array.isArray(template)) return template.map((t) => fill(t, ctx))
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, fill(v, ctx)]))
  }
  return template
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(assertUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res
}

/* ---------- 내장: Slack ---------- */
const slack: Integration = {
  id: 'slack',
  name: 'Slack',
  description: 'Incoming Webhook으로 요약·추천·대안 목록을 채널에 공유',
  source: 'builtin',
  fields: [{ key: 'webhookUrl', label: 'Incoming Webhook URL', secret: true, placeholder: 'https://hooks.slack.com/services/…' }],
  async send(run, config) {
    const s = run.synthesis
    const alts = s?.alternatives.map((a) => `• *${a.id}. ${a.name}* (${a.archetype}) — ${a.thesis}`).join('\n') ?? ''
    await postJson(config.webhookUrl, {
      text: `${run.title} — SUPER WORK LIKE MIN`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: run.title.slice(0, 150) } },
        { type: 'section', text: { type: 'mrkdwn', text: (s?.executiveSummary ?? run.brief).slice(0, 2900) } },
        s && { type: 'section', text: { type: 'mrkdwn', text: `*조건부 추천: ${s.recommendation.pick}*\n${s.recommendation.rationale}`.slice(0, 2900) } },
        alts && { type: 'section', text: { type: 'mrkdwn', text: alts.slice(0, 2900) } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'SUPER WORK – LIKE MIN 리포트' }] }
      ].filter(Boolean)
    })
    return { ok: true, message: 'Slack에 공유했습니다.' }
  }
}

/* ---------- 내장: Notion ---------- */
type NotionBlock = Record<string, unknown>
const rich = (text: string) =>
  (text.match(/[\s\S]{1,1900}/g) ?? ['']).map((chunk) => ({ type: 'text', text: { content: chunk } }))

function mdToNotionBlocks(md: string): NotionBlock[] {
  const blocks: NotionBlock[] = []
  for (const line of md.split('\n')) {
    const t = line.trimEnd()
    if (!t.trim() || /^\|\s*-/.test(t)) continue
    const h = t.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const type = `heading_${h[1].length}`
      blocks.push({ object: 'block', type, [type]: { rich_text: rich(h[2]) } })
    } else if (/^\s*-\s+/.test(t)) {
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rich(t.replace(/^\s*-\s+/, '')) } })
    } else if (t.startsWith('>')) {
      blocks.push({ object: 'block', type: 'quote', quote: { rich_text: rich(t.replace(/^>\s?/, '')) } })
    } else {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: rich(t.replace(/\*\*/g, '')) } })
    }
  }
  return blocks
}

const notion: Integration = {
  id: 'notion',
  name: 'Notion',
  description: '리포트 전체를 지정한 상위 페이지 아래 새 페이지로 생성',
  source: 'builtin',
  fields: [
    { key: 'token', label: 'Integration Token', secret: true, placeholder: 'ntn_…' },
    { key: 'parentPageId', label: '상위 페이지 ID', placeholder: '32자리 페이지 ID' }
  ],
  async send(run, config) {
    const headers = { Authorization: `Bearer ${config.token}`, 'Notion-Version': '2022-06-28' }
    const blocks = mdToNotionBlocks(runToMarkdown(run))
    const res = await postJson(
      'https://api.notion.com/v1/pages',
      {
        parent: { page_id: config.parentPageId.replace(/-/g, '').trim() },
        properties: { title: { title: [{ text: { content: run.title.slice(0, 200) } }] } },
        children: blocks.slice(0, 100)
      },
      headers
    )
    const page = (await res.json()) as { id: string; url?: string }
    for (let i = 100; i < blocks.length; i += 100) {
      const r = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ children: blocks.slice(i, i + 100) })
      })
      if (!r.ok) throw new Error(`Notion 블록 추가 실패: HTTP ${r.status}`)
    }
    return { ok: true, message: 'Notion 페이지를 만들었습니다.', url: page.url }
  }
}

/* ---------- 내장: NAVER WORKS (Bot API 2.0, 서비스 계정 JWT 인증) ----------
 * 1) Developer Console에서 앱 생성 → Client ID/Secret, Service Account, Private Key 발급, OAuth Scope에 bot 추가
 * 2) Bot 생성 → 관리자 콘솔에서 봇 공개 및 메시지방(채널)에 초대 → Bot ID, Channel ID 확인
 */
const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

function readPrivateKey(raw: string): string {
  const v = raw.trim()
  if (v.startsWith('-----BEGIN')) return v.replace(/\\n/g, '\n')
  return readFileSync(v, 'utf8') // 파일 경로로 입력한 경우
}

async function naverWorksToken(config: Config): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: config.clientId, sub: config.serviceAccount, iat: now, exp: now + 3600 }))}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(readPrivateKey(config.privateKey))
  const res = await fetch('https://auth.worksmobile.com/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'bot'
    })
  })
  if (!res.ok) throw new Error(`토큰 발급 실패 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { access_token: string }).access_token
}

const naverWorks: Integration = {
  id: 'naverworks',
  name: 'NAVER WORKS',
  description: '네이버웍스 봇으로 메시지방에 요약·4-3-2·추천을 전송',
  source: 'builtin',
  fields: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', secret: true },
    { key: 'serviceAccount', label: 'Service Account', placeholder: 'xxxx.serviceaccount@도메인' },
    { key: 'privateKey', label: 'Private Key (파일 경로 또는 PEM)', secret: true, placeholder: '/Users/me/private_xxx.key' },
    { key: 'botId', label: 'Bot ID' },
    { key: 'channelId', label: 'Channel ID (메시지방)' }
  ],
  async send(run, config) {
    const token = await naverWorksToken(config)
    const s = run.synthesis
    const claims = run.insight?.keyClaims.map((c, i) => `${i + 1}. ${c.claim}`).join('\n')
    const text = [
      `📌 ${run.title}`,
      s?.executiveSummary ?? run.brief,
      claims ? `\n[2 CORE KEY-CLAIMS]\n${claims}` : '',
      s ? `\n[조건부 추천] ${s.recommendation.pick}. ${s.alternatives.find((a) => a.id === s.recommendation.pick)?.name ?? ''}\n${s.recommendation.rationale}` : '',
      s ? `\n[대안]\n${s.alternatives.map((a) => `${a.id}. ${a.name} — ${a.thesis}`).join('\n')}` : '',
      '\n— SUPER WORK · LIKE MIN'
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000)
    const res = await fetch(
      `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(config.botId)}/channels/${encodeURIComponent(config.channelId)}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { type: 'text', text } })
      }
    )
    if (!res.ok) throw new Error(`메시지 전송 실패 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return { ok: true, message: 'NAVER WORKS 메시지방에 공유했습니다.' }
  }
}

/* ---------- 내장: 범용 Webhook (Zapier, Make, n8n, 사내 시스템) ---------- */
const webhook: Integration = {
  id: 'webhook',
  name: 'Webhook',
  description: 'Zapier·Make·n8n·사내 시스템으로 리포트 전체 JSON을 POST',
  source: 'builtin',
  fields: [
    { key: 'url', label: 'Webhook URL', placeholder: 'https://…' },
    { key: 'authHeader', label: 'Authorization 헤더 (선택)', secret: true }
  ],
  async send(run, config) {
    const v = vars(run)
    await postJson(
      config.url,
      { source: 'super-work-like-min', title: v.title, summary: v.summary, recommendation: v.recommendation, markdown: v.markdown, report: run },
      config.authHeader ? { Authorization: config.authHeader } : {}
    )
    return { ok: true, message: 'Webhook으로 전송했습니다.' }
  }
}

/* ---------- 내장: Email (기본 메일 앱) ---------- */
const email: Integration = {
  id: 'email',
  name: 'Email',
  description: '기본 메일 앱에 요약 초안을 연다 (전송은 직접)',
  source: 'builtin',
  fields: [],
  async send(run) {
    const v = vars(run)
    const body = `${v.summary}\n\n${v.recommendation}\n\n(전체 리포트는 첨부한 파일을 확인하세요)`
    await shell.openExternal(`mailto:?subject=${encodeURIComponent(run.title)}&body=${encodeURIComponent(body.slice(0, 1500))}`)
    return { ok: true, message: '메일 초안을 열었습니다.' }
  }
}

/* ---------- 선언형 플러그인 ---------- */
interface PluginSpec extends Omit<IntegrationInfo, 'source'> {
  request: { method?: string; url: string; headers?: Record<string, string>; body?: unknown }
}

export function pluginDirs(): string[] {
  return [resourceDir(join('plugins', 'integrations')), userDir('plugins')]
}

function loadPlugins(): Integration[] {
  const out: Integration[] = []
  for (const dir of pluginDirs()) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      try {
        const spec: PluginSpec = JSON.parse(readFileSync(join(dir, f), 'utf8'))
        if (!spec.id || !spec.request?.url) continue
        out.push({
          id: spec.id,
          name: spec.name,
          description: spec.description,
          fields: spec.fields ?? [],
          source: 'plugin',
          async send(run, config) {
            const ctx = { ...vars(run), ...config }
            const url = String(fill(spec.request.url, ctx))
            const headers = fill(spec.request.headers ?? {}, ctx) as Record<string, string>
            const res = await fetch(assertUrl(url), {
              method: spec.request.method ?? 'POST',
              headers: { 'Content-Type': 'application/json', ...headers },
              body: spec.request.body === undefined ? undefined : JSON.stringify(fill(spec.request.body, ctx))
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
            return { ok: true, message: `${spec.name}(으)로 전송했습니다.` }
          }
        })
      } catch {
        /* 잘못된 플러그인 파일은 건너뛴다 */
      }
    }
  }
  return out
}

function all(): Integration[] {
  const map = new Map<string, Integration>()
  for (const i of [slack, notion, naverWorks, webhook, email, ...loadPlugins()]) map.set(i.id, i)
  return [...map.values()]
}

export function listIntegrations(): IntegrationInfo[] {
  return all().map(({ id, name, description, fields, source }) => ({ id, name, description, fields, source }))
}

export async function sendIntegration(id: string, run: RunRecord, config: Config): Promise<Result> {
  const integ = all().find((i) => i.id === id)
  if (!integ) return { ok: false, message: '알 수 없는 연동입니다.' }
  const missing = requireFields(integ.fields.filter((f) => !f.label.includes('선택')), config)
  if (missing) return { ok: false, message: missing }
  try {
    return await integ.send(run, config)
  } catch (err) {
    return { ok: false, message: `${integ.name} 전송 실패: ${(err as Error).message}` }
  }
}
