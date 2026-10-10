import { ClaudeEngine } from '../src/main/engine/claude'
import { AuditResultSchema, ContextCanvasSchema } from '../src/shared/schemas'

const audit = { verdict: 'approve', trustScore: 80, issues: [], reworkInstruction: '', keptInsights: ['ok'] }
const calls: { format: boolean; hasInstruction: boolean }[] = []
const engine = new ClaudeEngine('sk-test', () => undefined)
let mode: 'grammarError' | 'ok' = 'grammarError'
;(engine as unknown as { send: (p: any) => Promise<any> }).send = async (p: any) => {
  const content = p.messages[0].content
  calls.push({ format: !!p.output_config.format, hasInstruction: Array.isArray(content) && content.some((b: any) => b.type === 'text' && b.text.includes('<output_format>')) })
  if (p.output_config.format && mode === 'grammarError') throw new Error('Claude API 오류 (400): The compiled grammar is too large, which would cause performance issues.')
  return { model: 'm', stop_reason: 'end_turn', content: [{ type: 'text', text: 'json\n```json\n' + JSON.stringify(audit) + '\n```' }], usage: { input_tokens: 1, output_tokens: 1 } }
}
const sig = new AbortController().signal
;(async () => {
  const r1 = await engine.structured({ model: 'm', system: [], user: 'x', effort: 'low', signal: sig, schema: AuditResultSchema })
  console.log('1) small schema + grammar error → fallback:', r1.verdict === 'approve', JSON.stringify(calls))
  calls.length = 0
  try {
    await engine.structured({ model: 'm', system: [], user: 'x', effort: 'low', signal: sig, schema: ContextCanvasSchema })
  } catch (e) {
    console.log('2) big schema first call used JSON mode directly:', calls[0] && !calls[0].format && calls[0].hasInstruction, '| retries:', calls.length, '| (validation fails on purpose):', String((e as Error).message).slice(0, 60))
  }
})()
