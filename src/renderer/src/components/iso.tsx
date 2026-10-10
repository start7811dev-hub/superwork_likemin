/**
 * 아이소메트릭 드로잉 키트 — 공정 시각화와 전략 다이어그램이 같은 룩앤필을 쓴다.
 * 둥근 모서리는 면과 같은 색의 굵은 round-join 스트로크로 만든다.
 */
export type Pt = [number, number]

export const TW = 64
export const TH = 32

export const iso = (gx: number, gy: number, z = 0): Pt => [((gx - gy) * TW) / 2, ((gx + gy) * TH) / 2 - z]
export const pts = (p: Pt[]) => p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')
export const pathD = (p: Pt[]) => p.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k)
  return `rgb(${r},${g},${b})`
}

/* ---------- 둥근 아이소 블록 (같은 색 굵은 round-join 스트로크로 모서리를 둥글게) ---------- */
export function Block(p: { gx: number; gy: number; w: number; d: number; h: number; z?: number; color: string; r?: number; opacity?: number }) {
  const z = p.z ?? 0
  const r = p.r ?? 5
  const x0 = p.gx - p.w / 2, x1 = p.gx + p.w / 2, y0 = p.gy - p.d / 2, y1 = p.gy + p.d / 2
  const T = (x: number, y: number) => iso(x, y, z + p.h)
  const B = (x: number, y: number) => iso(x, y, z)
  const left = shade(p.color, 0.9), right = shade(p.color, 0.8)
  const face = (points: Pt[], c: string) => <polygon points={pts(points)} fill={c} stroke={c} strokeWidth={r} strokeLinejoin="round" />
  return (
    <g opacity={p.opacity ?? 1}>
      {face([T(x0, y1), T(x1, y1), B(x1, y1), B(x0, y1)], left)}
      {face([T(x1, y0), T(x1, y1), B(x1, y1), B(x1, y0)], right)}
      {face([T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1)], p.color)}
    </g>
  )
}
