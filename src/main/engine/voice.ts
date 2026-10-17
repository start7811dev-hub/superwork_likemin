/**
 * AI 티 나는 표현 검사기 (brain/knowledge/min-voice.md §1·§5).
 * 윤문 단계를 돌릴지 정하고, 윤문 전후를 비교하는 데 쓴다.
 */

const PATTERNS: { re: RegExp; hint: string }[] = [
  // 연결 상투구
  { re: /결론부터 말하면/g, hint: '빼기' },
  { re: /핵심은 [^.\n]{0,30}(입니다|이다)/g, hint: '결론을 바로 쓰기' },
  { re: /라는 점에서/g, hint: '빼기' },
  { re: /(을|를) 통해(서)?/g, hint: '~로 / 동사로' },
  { re: /이를 (바탕으로|통해)/g, hint: '빼기' },
  { re: /다시 말해/g, hint: '빼기' },
  { re: /아울러|뿐만 아니라|나아가/g, hint: '문장을 나누기' },
  { re: /에 있어(서)?/g, hint: '~에서' },
  { re: /이러한 맥락에서|궁극적으로|요컨대/g, hint: '빼기' },
  // 문장 꼬리
  { re: /것이 중요합니다|것이 중요하다/g, hint: '무엇을 할지 쓰기' },
  { re: /라고 할 수 있(습니다|다)/g, hint: '단정하기' },
  { re: /(으로|로) 판단됩니다/g, hint: '단정하기' },
  { re: /이 요구됩니다|가 요구됩니다|이 기대됩니다|가 기대됩니다/g, hint: '주어와 동사로' },
  { re: /할 필요가 있(습니다|다)/g, hint: '~해야 한다' },
  { re: /에 기여할 것(입니다|이다)/g, hint: '결과를 숫자로' },
  // 한자어·추상어
  { re: /활용(하|해|한|할|됩|되)/g, hint: '쓰다' },
  { re: /제고/g, hint: '높이다' },
  { re: /도모/g, hint: '동사로' },
  { re: /구축/g, hint: '만들다·세우다' },
  { re: /극대화/g, hint: '숫자로' },
  { re: /최적화/g, hint: '맞추다' },
  { re: /강화(하|해|한|할|됩|되)/g, hint: '키우다' },
  { re: /확보(하|해|한|할|됩|되)/g, hint: '얻다·잡다' },
  { re: /수립/g, hint: '세우다·짜다' },
  { re: /(측면|관점|차원)에서/g, hint: '~로 보면 / 빼기' },
  { re: /다양한/g, hint: '실제로 나열' },
  { re: /효과적(인|으로)|효율적(인|으로)/g, hint: '무엇이 얼마나' },
  { re: /유의미한|실질적(인|으로)/g, hint: '얼마나' },
  { re: /본질적|근본적|궁극적/g, hint: '빼기' },
  { re: /전략적|체계적|다각적|선제적|총체적/g, hint: '빼기' },
  { re: /혁신적|획기적/g, hint: '무엇이 새로운지' },
  { re: /시너지/g, hint: '무엇이 무엇을 키우는지' },
  { re: /인사이트를 도출/g, hint: '알아낸 것은' },
  { re: /니즈를 충족/g, hint: '원하는 걸 준다' },
  { re: /해당 /g, hint: '이·그' },
  // 장면 은유 · 감정 선언
  { re: /달라 보입니다|달라 보인다|자랍니다|피어납니다|스며들|녹아들|조용히|천천히/g, hint: '의미를 직접 쓰기' },
  { re: /을 만나(다|고|게|는)|를 만나(다|고|게|는)|의 순간|너머/g, hint: '장면 대신 의미' },
  { re: /(을|를) 느끼(게|고|는|며|다)|느낀다|느낍니다|느끼게 된|감동을 (주|선사)|설렘|특별한 경험|선사(하|합|한)/g, hint: '감정 대신 행동·상태 변화' },
  // 번역투
  { re: /에 대한 /g, hint: '~의 / 빼기' },
  { re: /(을|를) 제공(하|합|한)/g, hint: '준다·보여 준다' },
  { re: /가 가능(하|합|한)|이 가능(하|합|한)/g, hint: '~할 수 있다' },
  { re: /하는 것이다|하는 것입니다/g, hint: '바로 서술' },
  { re: /동일한/g, hint: '같은' },
  // 공허한 명사
  { re: /(새로운|특별한|색다른|차별화된) (경험|가치|여정)/g, hint: '무엇의 무엇인지' }
]

/** 문장 단위 검사: 100자 넘는 문장, 짧은 단정문 연속, 본문의 명사형 종결 */
function sentenceHits(body: string): VoiceHit[] {
  const out: VoiceHit[] = []
  const prose = body
    .split('\n')
    .filter((l) => !/^\s*(#|>|\||-|\*|\d+\.)/.test(l))
    .join('\n')
  const sentences = prose.split(/(?<=[.!?。])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 0)
  const long = sentences.filter((x) => x.length > 100).length
  if (long) out.push({ phrase: '100자 넘는 문장', hint: '두 문장으로 나누기', count: long })
  let run = 0
  let choppy = 0
  for (const x of sentences) {
    if (x.length < 22 && /[다요]\.?$/.test(x)) {
      run++
      if (run === 3) choppy++
    } else run = 0
  }
  if (choppy) out.push({ phrase: '짧은 단정문 연속', hint: '길이를 섞고 접속어로 잇기', count: choppy })
  const nominal = sentences.filter((x) => x.length > 25 && /(함|됨|음|임|비움|필요|상황)\.?$/.test(x)).length
  if (nominal) out.push({ phrase: '명사형 종결 문장', hint: '~합니다/~다로', count: nominal })
  return out
}

export interface VoiceHit {
  phrase: string
  hint: string
  count: number
}

/** 텍스트 묶음에서 AI투 표현을 찾는다 (많은 순) */
export function lintVoice(texts: string[]): { total: number; hits: VoiceHit[]; perThousand: number } {
  const body = texts.join('\n')
  const map = new Map<string, VoiceHit>()
  for (const p of PATTERNS) {
    for (const m of body.matchAll(p.re)) {
      const key = m[0].trim()
      const h = map.get(key) ?? { phrase: key, hint: p.hint, count: 0 }
      h.count++
      map.set(key, h)
    }
  }
  const hits = [...map.values(), ...sentenceHits(body)].sort((a, b) => b.count - a.count)
  const total = hits.reduce((s, h) => s + h.count, 0)
  return { total, hits, perThousand: body.length ? (total / body.length) * 1000 : 0 }
}

/** 객체 안의 모든 문자열을 모은다 */
export function collectStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectStrings(x, out))
  return out
}
