/**
 * 바뀐 부분만 고치기: 모델이 낸 patches를 결과에 적용한다.
 * 전체를 다시 쓰면 출력이 수만 토큰이고, 다시 쓸수록 결과가 평균으로 돌아간다.
 *
 * 경로 문법: a.b.c · 배열은 [i](숫자) 또는 [ID](요소의 id 필드). 예: alternatives[A].thesis, comparison[0].scores
 */
export interface PatchOp {
  path: string
  value: string
}

const TOKEN = /([^.[\]]+)|\[([^\]]+)\]/g

function tokens(path: string): (string | { sel: string })[] {
  const out: (string | { sel: string })[] = []
  for (const m of path.matchAll(TOKEN)) out.push(m[1] !== undefined ? m[1] : { sel: m[2] })
  return out
}

function pick(arr: unknown[], sel: string): number {
  if (/^\d+$/.test(sel)) return Number(sel)
  return arr.findIndex((x) => x && typeof x === 'object' && (x as { id?: unknown }).id === sel)
}

/** 원래 값의 형태에 맞춰 문자열 값을 해석한다 */
function decode(raw: string, current: unknown): unknown {
  if (typeof current === 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    if (typeof current === 'number' && !Number.isNaN(Number(raw))) return Number(raw)
    return raw
  }
}

/** 적용한 결과와 적용하지 못한 경로를 돌려준다. 원본은 바꾸지 않는다. */
export function applyPatches<T>(target: T, ops: PatchOp[]): { result: T; skipped: string[] } {
  const result = structuredClone(target)
  const skipped: string[] = []
  for (const op of ops) {
    const ts = tokens(op.path.trim())
    if (!ts.length) {
      skipped.push(op.path)
      continue
    }
    let parent: unknown = result
    let ok = true
    for (let i = 0; i < ts.length - 1 && ok; i++) {
      const t = ts[i]
      if (typeof t === 'string') {
        parent = parent && typeof parent === 'object' ? (parent as Record<string, unknown>)[t] : undefined
      } else if (Array.isArray(parent)) {
        const k = pick(parent, t.sel)
        parent = k >= 0 ? parent[k] : undefined
      } else parent = undefined
      if (parent === undefined || parent === null) ok = false
    }
    const last = ts[ts.length - 1]
    if (!ok || !parent || typeof parent !== 'object') {
      skipped.push(op.path)
      continue
    }
    if (typeof last === 'string') {
      const obj = parent as Record<string, unknown>
      if (!(last in obj)) {
        skipped.push(op.path)
        continue
      }
      obj[last] = decode(op.value, obj[last])
    } else if (Array.isArray(parent)) {
      const k = pick(parent, last.sel)
      if (k < 0 || k > parent.length) {
        skipped.push(op.path)
        continue
      }
      parent[k] = decode(op.value, parent[k])
    } else skipped.push(op.path)
  }
  return { result, skipped }
}
