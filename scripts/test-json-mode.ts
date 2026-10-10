/** 구조화 출력 경로 모의 테스트: npx esbuild scripts/test-json-mode.ts --bundle --platform=node --outfile=/tmp/t.cjs && node /tmp/t.cjs */
import { ClaudeEngine } from '../src/main/engine/claude'
import { AuditResultSchema, SimulationSchema, WorkerReportSchema } from '../src/shared/schemas'

const sim = { personas: [{ name: 'A', situation: 's', lens: 'l', predictedBehavior: 'p', mechanism: 'm', signal: 'g' }], edgeCases: [], blindSpots: ['b'] }
const audit = { verdict: 'approve', trustScore: 80, issues: [], reworkInstruction: '', keptInsights: ['ok'] }
const sig = new AbortController().signal
const usage = { input_tokens: 1, output_tokens: 1 }

function engineWith(replies: ((p: any) => any)[]) {
  const e = new ClaudeEngine('sk-test', () => undefined)
  const seen: any[] = []
  let i = 0
  ;(e as any).send = async (p: any) => {
    seen.push(JSON.parse(JSON.stringify(p)))
    return { model: 'm', usage, ...replies[Math.min(i++, replies.length - 1)](p) }
  }
  return { e, seen }
}
const big = SimulationSchema // 테스트용으로 큰 스키마처럼 취급
;(async () => {
  // 강제로 도구 모드: 문법 오류를 먼저 던진다
  const grammar = () => { throw new Error('The compiled grammar is too large') }
  {
    const { e, seen } = engineWith([(p) => (p.output_config.format ? grammar() : { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'submit_result', input: sim }] })])
    ;(e as any).send = ((orig) => async (p: any) => { if (p.output_config.format) { seen.push(p); throw new Error('The compiled grammar is too large') } return orig(p) })((e as any).send)
    const r = await e.structured({ model: 'm', system: [], user: 'x', effort: 'low', signal: sig, schema: big })
    const last = seen[seen.length - 1]
    console.log('1) 도구 제출:', r.personas[0].name === 'A', '| tools:', last.tools?.[0]?.name, '| format 없음:', !last.output_config.format)
  }
  {
    const { e } = engineWith([() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"personas":[{"name":"30대가 "구독"이라는","situation":"s","lens":"l","predictedBehavior":"p","mechanism":"m","signal":"g"}],"edgeCases":[],"blindSpots":["b",],}' }] })])
    const r = await e.structured({ model: 'm', system: [], user: 'x', effort: 'low', signal: sig, schema: big })
    console.log('2) 깨진 따옴표 텍스트 복구:', r.personas[0].name)
  }
  {
    const { e, seen } = engineWith([
      () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't9', name: 'submit_result', input: { personas: 'oops' } }] }),
      () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't10', name: 'submit_result', input: sim }] })
    ])
    const r = await e.structured({ model: 'm', system: [], user: 'x', effort: 'low', signal: sig, schema: big })
    const fb = seen[1].messages[2].content[0]
    console.log('3) 잘못된 제출 → 재제출:', r.blindSpots[0] === 'b', '| tool_result is_error:', fb.type, fb.is_error, '|', String(fb.content).slice(0, 60))
  }
  {
    const { e, seen } = engineWith([() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(audit) }] })])
    const r = await e.structured({ model: 'm', system: [], user: 'x', effort: 'low', signal: sig, schema: AuditResultSchema })
    console.log('4) 작은 스키마는 structured outputs:', r.verdict, '| format 사용:', !!seen[0].output_config.format, '| tools 없음:', !seen[0].tools)
  }
  {
    const report = { summary: 's', findings: [
      { claim: 'a', kind: '사실', basis: 'b', source: '', confidence: '높음' },
      { claim: 'c', kind: 'Inference', basis: 'b', source: '', confidence: 'Medium' },
      { claim: 'd', kind: 'assumption', basis: 'b', source: '', confidence: 'low' }
    ], implications: [], proposals: [], risks: [], unknowns: [] }
    const { e, seen } = engineWith([() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(report) }] })])
    const r = await e.structured({ model: 'm', system: [], user: 'x', effort: 'low', signal: sig, schema: WorkerReportSchema })
    console.log('5) 분류값 자동 교정:', r.findings.map((f) => `${f.kind}/${f.confidence}`).join(', '), '| 재요청 없음:', seen.length === 1, '| format에 parse 없음:', !('parse' in seen[0].output_config.format))
  }
})()
