import type { Factbook } from './schemas'
import type { RunRecord } from './types'
import { estimateCost } from './types'

const KIND: Record<string, string> = { fact: '사실', inference: '추론', hypothesis: '가설', opinion: '의견' }
const LEVEL: Record<string, string> = { high: '높음', medium: '중간', low: '낮음' }

const list = (items: string[] | undefined) => (items?.length ? items.map((i) => `- ${i}`).join('\n') : '- (없음)')
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** 실행 결과를 공유·연동용 마크다운으로 변환한다. */
export function runToMarkdown(run: RunRecord): string {
  const out: string[] = []
  const s = run.synthesis
  const c = run.canvas

  out.push(`# ${run.title}`)
  out.push(
    `> SUPER WORK – LIKE MIN · ${new Date(run.createdAt).toLocaleString('ko-KR')} · 깊이: ${run.depth} · 두뇌 v${run.brainVersion} · 비용 약 $${estimateCost(run.usage).toFixed(2)}`
  )
  out.push(`## 요청\n\n${run.brief}`)
  if (run.materials?.length) out.push(`**참고 자료:** ${run.materials.map((m) => m.source).join(' · ')}`)

  if (s) {
    out.push(`## 요약\n\n${s.executiveSummary}`)
    out.push(
      `## 코어\n\n| 축 | 내용 |\n| --- | --- |\n| 목표 | ${cell(s.coreRestated.goal)} |\n| 목적 | ${cell(s.coreRestated.purpose)} |\n| 브랜드 | ${cell(s.coreRestated.brand)} |\n| 소비자 | ${cell(s.coreRestated.consumer)} |\n| 시장 | ${cell(s.coreRestated.market)} |`
    )
    if (run.answers?.length) out.push(`## MPM의 질문과 MIN의 답\n\n${run.answers.map((x) => `- **${x.question}** — ${x.answer}`).join('\n')}`)
    if (s.deliverable?.sections.length)
      out.push(`## 산출물: ${s.deliverable.title}\n\n${s.deliverable.sections.map((x) => `### ${x.heading}\n\n${x.body}`).join('\n\n')}`)
    const rec = s.recommendation
    out.push(
      `## 조건부 추천: ${rec.pick}\n\n${rec.rationale}\n\n**유효 조건**\n${list(rec.conditions)}\n\n**전환 계획:** ${rec.switchTo}`
    )
    if (run.insight) out.push(insightToMarkdown(run))
    out.push(`## 대안 (${s.alternatives.length})`)
    for (const a of s.alternatives) {
      out.push(
        [
          `### ${a.id}. ${a.name}  \`${a.archetype}\``,
          `${a.thesis}`,
          `**작동 방식**\n${list(a.howItWorks)}`,
          `**왜 · 영향력 확산:** ${a.influencePath}`,
          `**비용:** ${a.cost.estimate}\n${list(a.cost.breakdown)}\n\n확인 필요: ${a.cost.needsVerification.join(' · ') || '-'}\n\n가치 판단이 바뀌는 상황: ${a.cost.valueShiftsWhen.join(' · ') || '-'}`,
          `**차별화:** ${a.differentiation}\n\n**유지할 관성 → 혁신:** ${a.keepInertia} → ${a.innovation}\n\n**빼는 것:** ${a.omit.join(' · ') || '-'}\n\n**첫인상 / 반복 사용:** ${a.firstImpression} / ${a.repeatUse}`,
          `| 브랜드 | 소비자 | 시장 |\n| --- | --- | --- |\n| ${cell(a.brandImpact)} | ${cell(a.consumerImpact)} | ${cell(a.marketImpact)} |`,
          `목표 적합도 **${a.goalFit}/5** · 목적 적합도 **${a.purposeFit}/5** · 가역성 ${LEVEL[a.reversibility] ?? a.reversibility} · 확신도 ${LEVEL[a.confidence] ?? a.confidence}`,
          `**트레이드오프**\n${list(a.tradeoffs)}`,
          `**엣지 케이스**\n${list(a.edgeCases)}`,
          `**리스크**\n${list(a.risks)}`,
          `**철회 조건**\n${list(a.killCriteria)}`,
          `**첫 단계**\n${list(a.firstSteps)}`
        ].join('\n\n')
      )
    }
    if (s.comparison.length) {
      const ids = s.alternatives.map((a) => a.id)
      const rows = s.comparison.map(
        (r) =>
          `| ${cell(r.criterion)} | ${ids
            .map((id) => {
              const sc = r.scores.find((x) => x.alternativeId === id)
              return sc ? `${sc.score} — ${cell(sc.note)}` : '-'
            })
            .join(' | ')} |`
      )
      out.push(`## 비교\n\n| 기준 | ${ids.join(' | ')} |\n| --- | ${ids.map(() => '---').join(' | ')} |\n${rows.join('\n')}`)
    }
    out.push(
      `## 사실 / 가정 / 미확인\n\n**확인된 사실**\n${list(s.factsVsAssumptions.verifiedFacts)}\n\n**가정**\n${list(s.factsVsAssumptions.assumptions)}\n\n**미확인**\n${list(s.factsVsAssumptions.unverified)}`
    )
    out.push(
      `## 다음 검증\n\n| 확인할 것 | 방법 | 맞으면 | 틀리면 |\n| --- | --- | --- | --- |\n${s.nextVerification
        .map((v) => `| ${cell(v.check)} | ${cell(v.method)} | ${cell(v.ifTrue)} | ${cell(v.ifFalse)} |`)
        .join('\n')}`
    )
    out.push(`## 열린 질문\n\n${list(s.openQuestions)}`)
  }

  if (c) {
    out.push(
      `## 부록 A. 맥락 캔버스\n\n**표면 요청:** ${c.reframe.surfaceRequest}\n\n**실제 문제:** ${c.reframe.realProblem}\n\n**의심한 전제**\n${list(c.reframe.questionedPremises)}\n\n**판단 기준(우선순위)**\n${c.criteria
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((k) => `${k.priority}. ${k.criterion}`)
        .join('\n')}\n\n**바꿀 수 없는 것**\n${list(c.boundaries.fixed)}\n\n**가정 금지**\n${list(c.boundaries.mustNotAssume)}`
    )
  }

  if (run.simulation) {
    const sim = run.simulation
    out.push(
      `## 부록 B. 타깃 시뮬레이션\n\n${sim.personas
        .map(
          (p) =>
            `- **${p.name}** (${p.situation}) — ${p.predictedBehavior}\n  - 메커니즘: ${p.mechanism} · 렌즈: ${p.lens}\n  - 관찰 신호: ${p.signal}`
        )
        .join('\n')}\n\n**엣지 케이스**\n${sim.edgeCases.map((e) => `- ${e.scenario} → ${e.impact} / 대응: ${e.mitigation}`).join('\n')}`
    )
  }

  const v = run.verification
  if (v) {
    const issues = (r?: { issues: { target: string; problem: string; fix: string }[] }) =>
      r?.issues.length ? r.issues.map((i) => `- **${i.target}** ${i.problem} → ${i.fix}`).join('\n') : '- 수정 없이 유지'
    out.push(
      `## 부록 B-2. 검증 이력\n\n${v.versions.map((x, i) => `${i + 1}. ${x.label}`).join('\n')}\n\n**재검증**\n${issues(v.review)}\n\n**최종 검증 A · 고도화**\n${issues(v.refine)}${
        v.clone ? `\n\n**최종 검증 B · MPM 클론**\n\n> ${v.clone.insight}\n\n- 의도·목적: ${v.clone.macro.intentPurpose}\n- 타깃·브랜드: ${v.clone.macro.targetBrand}\n- 시장: ${v.clone.macro.market}${v.clone.bigIssue ? `\n- 📣 직권 지시: ${v.clone.directive}` : ''}` : ''
      }`
    )
  }

  if (run.factbook) out.push(factbookToMarkdown(run.factbook, '## 부록 D. Factbook', '###'))

  const tasks = Object.values(run.tasks)
  if (tasks.length) {
    out.push(`## 부록 C. 분장 및 검수 기록`)
    for (const t of tasks) {
      const last = t.rounds[t.rounds.length - 1]
      out.push(
        `### ${t.task.title} (${t.task.roleId}) — 라운드 ${t.rounds.length}, 신뢰도 ${last?.audit?.trustScore ?? '-'}\n\n${last?.report.summary ?? ''}\n\n${(last?.report.findings ?? [])
          .map((f) => `- [${KIND[f.kind] ?? f.kind}·${LEVEL[f.confidence] ?? f.confidence}] ${f.claim}${f.source ? ` (출처: ${f.source})` : ''}`)
          .join('\n')}`
      )
    }
  }
  return out.join('\n\n') + '\n'
}

/** Factbook 단독 문서 / 부록 */
export function factbookToMarkdown(f: Factbook, title = '# Factbook', h = '##'): string {
  const out: string[] = [title, `> ${f.scope}`]
  if (f.datasets.length)
    out.push(`${h} 데이터\n\n${f.datasets.map((d) => `**${d.title}** (${d.unit}) — 출처: ${d.source}\n\n| 항목 | 값 | 비고 |\n| --- | --- | --- |\n${d.rows.map((r) => `| ${cell(r.label)} | ${r.value} | ${cell(r.note)} |`).join('\n')}`).join('\n\n')}`)
  if (f.products.length)
    out.push(`${h} 브랜드 · 제품\n\n${f.products.map((p) => `**${p.brand} ${p.name}** (${p.role === 'ours' ? '우리' : p.role === 'competitor' ? '경쟁' : '참고'}${p.price ? `, ${p.price}` : ''})\n\n- 포지셔닝: ${p.positioning}\n- USP: ${p.usp}\n${p.keyFeatures.map((k) => `- ${k.feature} → ${k.benefit}\n  - ${k.explainer}`).join('\n')}`).join('\n\n')}`)
  if (f.competitors.length)
    out.push(`${h} 경쟁사\n\n| 경쟁사 | 포지셔닝 | 강점 | 약점 | 주요 제품 |\n| --- | --- | --- | --- | --- |\n${f.competitors.map((c) => `| ${cell(c.name)} | ${cell(c.positioning)} | ${cell(c.strengths.join(', '))} | ${cell(c.weaknesses.join(', '))} | ${cell(c.keyProducts.join(', '))} |`).join('\n')}`)
  out.push(`${h} 사실\n\n${f.facts.map((x) => `- [${x.category}] ${x.statement} — ${x.url ? `[${x.source}](${x.url})` : x.source}${x.date ? `, ${x.date}` : ''}`).join('\n') || '- (없음)'}`)
  if (f.glossary.length) out.push(`${h} 용어\n\n${f.glossary.map((g) => `- **${g.term}**: ${g.explanation}`).join('\n')}`)
  if (f.gaps.length) out.push(`${h} 확인하지 못한 것\n\n${list(f.gaps)}`)
  return out.join('\n\n')
}

/** SUPER INSIGHT: MIN'S 4-3-2 THINKING + 방법론 분석 */
export function insightToMarkdown(run: RunRecord): string {
  const i = run.insight!
  const out = [
    `## SUPER INSIGHT · MIN'S 4-3-2 THINKING`,
    `### 2 CORE KEY-CLAIMS\n${i.keyClaims.map((c, k) => `${k + 1}. **${c.claim}** — ${c.support}`).join('\n')}`,
    `### 3 KEY SUCCESS FACTORS\n${i.ksf.map((c, k) => `${k + 1}. **${c.factor}** — ${c.why} (지표: ${c.measure})`).join('\n')}`,
    `### 4 SUPER STRATEGIES\n${i.superStrategies.map((c, k) => `${k + 1}. **${c.name}** [근거 ${c.strength}] \`${c.methods}\` — ${c.description}`).join('\n')}`
  ]
  if (i.jtbd.length)
    out.push(`### JTBD\n\n| # | When / I want to / So I can | 지금 고용 중 | 해고 계기 | 중요/만족 |\n| --- | --- | --- | --- | --- |\n${i.jtbd.map((j, k) => `| J${k + 1} | ${cell(`${j.situation}, ${j.motivation} — ${j.outcome}`)} | ${cell(j.currentSolution)} | ${cell(j.firingTrigger)} | ${j.importance}/${j.satisfaction} |`).join('\n')}`)
  if (i.aarrr.length)
    out.push(`### AARRR\n\n| 단계 | 현재 | 이탈·병목 | 개선 레버 | 건강도 |\n| --- | --- | --- | --- | --- |\n${i.aarrr.map((a) => `| ${a.label} | ${cell(a.current)} | ${cell(a.leak)} | ${cell(a.lever)} | ${a.health}/5 |`).join('\n')}`)
  if (i.tows.so.length || i.tows.wo.length)
    out.push(`### TOWS\n\n| | 기회(O) | 위협(T) |\n| --- | --- | --- |\n| **강점(S)** | ${cell(i.tows.so.join(' / '))} | ${cell(i.tows.st.join(' / '))} |\n| **약점(W)** | ${cell(i.tows.wo.join(' / '))} | ${cell(i.tows.wt.join(' / '))} |`)
  if (i.stp.segments.length)
    out.push(`### STP 2.0\n\n포지셔닝: **${i.stp.positioning.statement}**\n\n타깃: **${i.stp.target.segment}** — ${i.stp.target.why}\n\n${i.stp.segments.map((g) => `- ${g.name} (매력도 ${g.attractiveness}/5): ${g.behavior} / ${g.taste}`).join('\n')}`)
  if (i.cdj.length)
    out.push(`### CDJ\n\n| 단계 | 터치포인트 | 감정 | 페인 | 기회 |\n| --- | --- | --- | --- | --- |\n${i.cdj.map((c) => `| ${c.label} | ${cell(c.touchpoints.join(', '))} | ${c.emotion} | ${cell(c.pain)} | ${cell(c.opportunity)} |`).join('\n')}`)
  if (i.unit.assumptions.length) {
    const u = i.unit
    out.push(`### 유닛 이코노믹스\n\nLTV ${Math.round(u.ltv).toLocaleString()} · CAC ${Math.round(u.cac).toLocaleString()} · **LTV/CAC ${u.ltvToCac.toFixed(1)}×** · 회수 ${u.paybackMonths.toFixed(1)}개월 (${u.currency})\n\n${u.verdict}\n\n| 가정 | 값 | 근거 | 검증 |\n| --- | --- | --- | --- |\n${u.assumptions.map((a) => `| ${cell(a.name)} | ${a.value} ${a.unit} | ${cell(a.basis)} | ${a.verified ? '확인' : '확인 필요'} |`).join('\n')}`)
  }
  if (i.competition.players.length)
    out.push(`### 경쟁 구도\n\n| 플레이어 | 유형 | 포지션 | 강도 | 위협 |\n| --- | --- | --- | --- | --- |\n${i.competition.players.map((p) => `| ${cell(p.name)} | ${p.kind === 'direct' ? '직접' : p.kind === 'indirect' ? '간접' : '대체재'} | ${cell(p.position)} | ${p.strength} | ${p.threat} |`).join('\n')}\n\n**비어 있는 자리:** ${i.competition.whitespace}`)
  return out.join('\n\n')
}
