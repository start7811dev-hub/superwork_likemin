/**
 * LIKE MIN 캠퍼스 — 아이소메트릭 오피스 시뮬레이션.
 * 화이트 바닥 위 둥근 파스텔 스테이션, 형광 핑크(지시)·라임(보고) 파이프라인,
 * 업무 상자를 들고 뛰어다니는 캐릭터들, 소파에 앉아 지시하는 MPM,
 * 그리고 회사 밖 수영장과 스포츠카.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TaskSpec } from '@shared/schemas'
import type { NodeStatus, PacketKind } from '@shared/types'
import { PACKET_MS, type LiveState } from '../live'
import { Block, TH, TW, iso, pathD, pts, shade, type Pt } from './iso'


type Kind = 'inbox' | 'think' | 'board' | 'gate' | 'worker' | 'stage' | 'printer' | 'dock' | 'ghost' | 'library' | 'loupe' | 'polish' | 'tower' | 'lab'

interface StationDef {
  id: string
  gx: number
  gy: number
  kind: Kind
  title: string
  sub: string
  color: string
}


/* ---------- 팔레트 ---------- */
const PINK = '#ff3fa4'
const LIME = '#a6f43c'
const PASTEL = ['#ffd8e8', '#d9f7c4', '#d6e6ff', '#fff1b8', '#e7dcff', '#c9f3ef', '#ffe0c7']
const CHAR = ['#ff7eb6', '#7bd389', '#6aa8ff', '#ffc94d', '#b08cff', '#4fd1c5', '#ff9f6e']

const PACKET_COLOR: Record<PacketKind, string> = {
  brief: '#ffffff',
  canvas: '#e7dcff',
  task: PINK,
  report: LIME,
  rework: '#ff5a4e',
  approved: LIME,
  insight: '#b08cff',
  final: '#ffc94d',
  fact: '#4fd1c5',
  revise: '#ff9f6e',
  directive: '#4f6bed'
}

const STATUS_COLOR: Record<NodeStatus, string> = {
  idle: '#c9ccd3',
  queued: '#c9ccd3',
  running: PINK,
  waiting: '#4f6bed',
  done: '#3fc46a',
  rework: '#ff5a4e',
  error: '#ff5a4e'
}
const STATUS_LABEL: Record<NodeStatus, string> = {
  idle: '대기',
  queued: '대기',
  running: '일하는 중',
  waiting: '질문 대기',
  done: '완료',
  rework: '반려됨',
  error: '오류'
}

/* ---------- 위트 대사 ---------- */
const WORKER_LINES = [
  '출처 어디 갔지?!',
  '이거 사실이야, 추론이야?',
  '그래서 비용은요…?',
  '차별을 위한 차별 금지!',
  '불편하면 빼자!',
  '첫인상 ≠ 반복 사용',
  '타깃이 진짜 쓸까?',
  '엣지 케이스 하나 더…',
  '커피 수혈 중 ☕',
  '데이터가 말하게 하자'
]
const REWORK_LINES = ['MPM이 안 믿어요 ㅠ', '근거 보강 중…', '다시 해 올게요!']
const DONE_LINES = ['보고 완료! 🙌', '검수 통과!', '퇴근각?']
const IDLE_LINES = ['Zzz…', '일 주세요~', '(멍)']

function mpmLine(live: LiveState): string {
  const s = (id: string) => live.nodes[id]?.status
  if (live.questions) return '잠깐! MIN한테 먼저 물어보자 🙋'
  if (live.status === 'done') return '좋아, 퇴근하고 수영 가자 🏊'
  if (live.status === 'error') return '음… 뭔가 꼬였네 🤔'
  if (live.status === 'cancelled') return '오늘은 여기까지!'
  if (s('clone') === 'running') return live.nodes.clone?.detail?.includes('직권') ? '클론아, 네 말이 맞다…! 🫡' : '클론, 숲 좀 봐 줘 🔭'
  if (s('refine') === 'running') return '디테일 하나만 더…✨'
  if (s('review') === 'running') return '음… 다시 생각해 보니 🤔'
  if (s('synthesize') === 'running') return '일단 끝까지 가 보자! ⚡'
  if (s('insight') === 'running') return '4-3-2부터 찍고 가자 🎯'
  if (s('factbook') === 'running') return '팩트부터 모아 와 📚'
  if (s('simulate') === 'running') return '엣지 타깃도 생각해 봤어?'
  if (Object.values(live.nodes).some((n) => n.status === 'rework')) return '음… 못 믿겠는데? 다시! 🔍'
  if (s('audit') === 'running') return '출처 없으면 반려야~'
  if (s('dispatch') === 'running') return '직함 말고 책임으로 나눌게'
  if (s('intake') === 'running') return '이거… 왜 하는 거죠? 🤨'
  if (live.status === 'running') return '다들 화이팅~ 📣'
  return '자, 오늘은 뭐부터 할까?'
}

/** 역할별 에이전트 질감 */
const ROLE_AGENT: Record<string, AgentType> = {
  market: 'sleek', consumer: 'fluffy', brand: 'slime', biz: 'blocky', product: 'sleek',
  growth: 'fluffy', verifier: 'spiky', devil: 'spiky', ops: 'blocky'
}

function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

/* ---------- 레이아웃 ---------- */
/** 검증 루프가 놓이는 2열의 gy */
const VROW = 8.4

function layout(tasks: TaskSpec[]): StationDef[] {
  const n = tasks.length || 3
  const gap = n > 4 ? 2.7 : 3
  const workers: StationDef[] = (tasks.length ? tasks : [null, null, null]).map((t, i) => ({
    id: t ? `worker:${t.id}` : `ghost:${i}`,
    gx: 10,
    gy: (i - (n - 1) / 2) * gap,
    kind: t ? 'worker' : 'ghost',
    title: t ? t.title : '하위 담당',
    sub: t ? t.roleId : 'MPM이 배정',
    color: PASTEL[i % PASTEL.length]
  }))
  return [
    { id: 'inbox', gx: 0, gy: 0, kind: 'inbox', title: '업무 지시', sub: 'INBOX', color: '#d6e6ff' },
    { id: 'intake', gx: 3.3, gy: 0, kind: 'think', title: '맥락 설계실', sub: '허물고 다시 세우기', color: '#e7dcff' },
    { id: 'dispatch', gx: 6.6, gy: 0, kind: 'board', title: '업무 분장 보드', sub: '직함 말고 책임', color: '#ffd8e8' },
    ...workers,
    { id: 'audit', gx: 13.6, gy: 0, kind: 'gate', title: '검수 게이트', sub: '일단 안 믿음', color: '#fff1b8' },
    { id: 'factbook', gx: 16.9, gy: 0, kind: 'library', title: 'Factbook 도서관', sub: '확실한 팩트만', color: '#c9f3ef' },
    { id: 'simulate', gx: 20.2, gy: 0, kind: 'stage', title: '타깃 롤플레이 극장', sub: '엣지 · 페르소나', color: '#ffe0c7' },
    { id: 'insight', gx: 23.5, gy: 0, kind: 'lab', title: 'SUPER INSIGHT 연구소', sub: '4-3-2 THINKING', color: '#ffd8e8' },
    { id: 'synthesize', gx: 26.8, gy: 0, kind: 'printer', title: '대안 프린터', sub: '일단 결과부터', color: '#e7dcff' },
    // 검증 루프 (2열, 오른쪽 → 왼쪽)
    { id: 'review', gx: 26.8, gy: VROW, kind: 'loupe', title: '재검증실', sub: '다시 한번 고민', color: '#fff1b8' },
    { id: 'refine', gx: 23.5, gy: VROW, kind: 'polish', title: '고도화 공방', sub: '최종 검증 A', color: '#d9f7c4' },
    { id: 'clone', gx: 20.2, gy: VROW, kind: 'tower', title: 'MPM 클론 전망대', sub: '최종 검증 B', color: '#d6e6ff' },
    { id: 'deliver', gx: 16.9, gy: VROW, kind: 'dock', title: '최종 리포트', sub: 'OUTPUT', color: '#ffd8e8' }
  ]
}

function route(a: StationDef, b: StationDef): Pt[] {
  if (Math.abs(a.gy - b.gy) < 0.01) return [[a.gx, a.gy], [b.gx, b.gy]]
  const mx = (a.gx + b.gx) / 2
  return [[a.gx, a.gy], [mx, a.gy], [mx, b.gy], [b.gx, b.gy]]
}

function pointAlong(path: Pt[], t: number): Pt {
  const lens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]))
  let d = lens.reduce((a, b) => a + b, 0) * t
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, d / lens[i]) : 0
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k]
    }
    d -= lens[i]
  }
  return path[path.length - 1]
}



/* ---------- 캐릭터 ---------- */
/* ---------- 에이전트 캐릭터 ----------
 * 공통: 스크린 바이저 눈, 상태 LED 안테나, 질감별 몸체.
 * fluffy 털복숭이 · sleek 매끈이 · spiky 까칠이 · slime 미끄럼이 · blocky 각진이
 */
export type AgentType = 'fluffy' | 'sleek' | 'spiky' | 'slime' | 'blocky'
export const AGENT_NAME: Record<AgentType, string> = { fluffy: '털복숭이', sleek: '매끈이', spiky: '까칠이', slime: '미끄럼이', blocky: '각진이' }
const AGENT_TYPES: AgentType[] = ['fluffy', 'sleek', 'spiky', 'slime', 'blocky']
export const agentTypeOf = (seed: string | number): AgentType => AGENT_TYPES[Math.abs(typeof seed === 'number' ? seed : hash(seed)) % AGENT_TYPES.length]

const FLUFF_PATH = (() => {
  const out: string[] = []
  const n = 16
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 10.5 : 8.6
    const x = Math.cos(a) * r * 0.92, y = -12 + Math.sin(a) * r
    out.push(`${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return out.join(' ') + 'Z'
})()
const SPIKE_PTS = (() => {
  const out: string[] = []
  const n = 22
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 7.8 : 11.2
    out.push(`${(Math.cos(a) * r * 0.9).toFixed(2)},${(-12 + Math.sin(a) * r).toFixed(2)}`)
  }
  return out.join(' ')
})()

function AgentBody({ type, color }: { type: AgentType; color: string }) {
  const dark = shade(color, 0.72)
  switch (type) {
    case 'fluffy':
      return (
        <g>
          <path d={FLUFF_PATH} fill={color} stroke={color} strokeWidth={3} strokeLinejoin="round" />
          <path d={FLUFF_PATH} fill="none" stroke={dark} strokeWidth={0.6} strokeDasharray="1 2" opacity={0.6} />
          {[-4, -1, 2, 5].map((dx, i) => <path key={i} d={`M${dx} -21 q1 -3 ${i % 2 ? 2 : -1} -4`} stroke={dark} strokeWidth={0.9} fill="none" strokeLinecap="round" />)}
        </g>
      )
    case 'sleek':
      return (
        <g>
          <rect x={-8} y={-22} width={16} height={19} rx={8} fill={color} />
          <ellipse cx={-3.2} cy={-17.5} rx={2.6} ry={4.2} fill="#ffffff" opacity={0.55} transform="rotate(20 -3.2 -17.5)" />
          <rect x={-8} y={-9} width={16} height={1.2} fill="rgba(255,255,255,.35)" />
        </g>
      )
    case 'spiky':
      return (
        <g>
          <polygon points={SPIKE_PTS} fill={color} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M-6 -19 L-1.5 -17.5 M6 -19 L1.5 -17.5" stroke="#2b2b3a" strokeWidth={1.1} strokeLinecap="round" />
        </g>
      )
    case 'slime':
      return (
        <g>
          <path d="M-9 -2 C-10 -14 -5 -23 0 -23 C5 -23 10 -14 9 -2 Q7 1 5 -1 Q3 3 1 -1 Q-2 2 -4 -1 Q-7 1 -9 -2Z" fill={color} fillOpacity={0.88} />
          <ellipse cx={-3.5} cy={-17} rx={2} ry={3.4} fill="#ffffff" opacity={0.65} />
          <circle cx={4.6} cy={-19} r={1} fill="#ffffff" opacity={0.7} />
          <path d="M3 0 q0 3 1 3.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" className="drip" />
        </g>
      )
    case 'blocky':
      return (
        <g>
          <polygon points="-8,-20 0,-24 8,-20 0,-16" fill={shade(color, 1.08)} />
          <polygon points="-8,-20 0,-16 0,-3 -8,-7" fill={color} />
          <polygon points="8,-20 0,-16 0,-3 8,-7" fill={dark} />
          <rect x={-6} y={-12} width={4} height={1} fill="rgba(255,255,255,.5)" />
        </g>
      )
  }
}

function Buddy({ x, y, color, k = 1, mood = 'idle', flip = false, carry, glasses, type, led, children }: {
  x: number; y: number; color: string; k?: number
  mood?: 'idle' | 'work' | 'run' | 'happy' | 'sad' | 'sleep' | 'boss'
  flip?: boolean; carry?: string; glasses?: boolean; type?: AgentType; led?: string; children?: ReactNode
}) {
  const t = type ?? agentTypeOf(color)
  const moving = mood === 'run'
  const hover = t === 'sleek' || t === 'slime'
  const eye = mood === 'sad' ? '#ff6b9d' : mood === 'happy' ? LIME : mood === 'boss' ? '#ffd84d' : '#5cf2ff'
  const ledColor = led ?? (mood === 'work' || moving ? PINK : mood === 'sad' ? '#ff5a4e' : mood === 'happy' ? '#3fc46a' : mood === 'sleep' ? '#c9ccd3' : LIME)
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${flip ? -k : k},${k})`}>
      <ellipse cx={0} cy={0} rx={7.5} ry={2.4} fill={hover ? eye : 'rgba(30,30,60,.14)'} opacity={hover ? 0.35 : 1} className={hover ? 'shadow-pulse' : undefined} />
      <g className={moving ? 'bob-fast' : mood === 'work' ? 'bob' : mood === 'happy' ? 'hop' : hover ? 'hover' : undefined}>
        {!hover && mood !== 'boss' && (
          <>
            <rect className={moving ? 'leg-a' : undefined} x={-4.5} y={-5} width={3.2} height={5} rx={1.6} fill={shade(color, 0.6)} />
            <rect className={moving ? 'leg-b' : undefined} x={1.3} y={-5} width={3.2} height={5} rx={1.6} fill={shade(color, 0.6)} />
          </>
        )}
        <g transform={hover ? 'translate(0,-2)' : undefined}>
          <AgentBody type={t} color={color} />
          {/* 안테나 + 상태 LED */}
          <line x1={0} y1={t === 'blocky' ? -24 : -22} x2={0} y2={-28} stroke="#2b2b3a" strokeWidth={0.9} />
          <circle cx={0} cy={-28.6} r={1.8} fill={ledColor} className={mood === 'work' || moving ? 'blink' : undefined} />
          <circle cx={0} cy={-28.6} r={3.4} fill={ledColor} opacity={0.25} />
          {/* 스크린 바이저 */}
          <rect x={-6.4} y={-17} width={12.8} height={6.4} rx={3.2} fill="#1b1f2e" />
          {mood === 'sleep' ? (
            <path d="M-4 -13.6 h2.6 M1.4 -13.6 h2.6" stroke={eye} strokeWidth={0.9} strokeLinecap="round" opacity={0.6} />
          ) : mood === 'happy' ? (
            <path d="M-4.2 -12.8 l1.4 -1.6 l1.4 1.6 M1.4 -12.8 l1.4 -1.6 l1.4 1.6" stroke={eye} strokeWidth={1} fill="none" strokeLinecap="round" />
          ) : (
            <g className="eye">
              <rect x={-4.3} y={-15.3} width={2.6} height={mood === 'sad' ? 2 : 3} rx={1} fill={eye} transform={mood === 'sad' ? 'rotate(-15 -3 -14)' : undefined} />
              <rect x={1.7} y={-15.3} width={2.6} height={mood === 'sad' ? 2 : 3} rx={1} fill={eye} transform={mood === 'sad' ? 'rotate(15 3 -14)' : undefined} />
            </g>
          )}
          {glasses && <rect x={-7} y={-17.6} width={14} height={2} rx={1} fill="#ff3fa4" opacity={0.9} />}
          {mood === 'sad' && <path d="M7 -21 q1.6 2.4 0 3.4 q-1.6 -1 0 -3.4" fill="#7cc8ff" />}
        </g>
        {carry && (
          <g>
            <rect x={-6.5} y={-38} width={13} height={9} rx={2.5} fill={carry} stroke="rgba(0,0,0,.12)" />
            <rect x={-6.5} y={-34.5} width={13} height={1.4} fill="rgba(255,255,255,.6)" />
          </g>
        )}
        {children}
      </g>
    </g>
  )
}

function Bubble({ x, y, text, tone = 'white' }: { x: number; y: number; text: string; tone?: 'white' | 'blue' | 'pink' }) {
  const w = Math.max(40, [...text].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 9.6 : 5.6), 0) + 16)
  const fill = tone === 'blue' ? '#4f6bed' : tone === 'pink' ? PINK : '#ffffff'
  const ink = tone === 'white' ? '#2b2b3a' : '#ffffff'
  return (
    <g transform={`translate(${(x - w / 2).toFixed(1)},${(y - 24).toFixed(1)})`}><g className="bubble">
      <rect width={w} height={18} rx={9} fill={fill} stroke="rgba(30,30,60,.08)" filter="url(#soft)" />
      <path d={`M${w / 2 - 4} 17 L${w / 2} 23 L${w / 2 + 4} 17 Z`} fill={fill} />
      <text x={w / 2} y={12.4} textAnchor="middle" className="bubble-text" fill={ink}>
        {text}
      </text>
    </g></g>
  )
}

/* ---------- 스테이션 소품 ---------- */
function Prop({ s, status, tick }: { s: StationDef; status: NodeStatus; tick: number }) {
  const { gx, gy, color } = s
  const on = status === 'running' || status === 'waiting'
  switch (s.kind) {
    case 'ghost':
      return <polygon points={pts([iso(gx - 0.7, gy - 0.6), iso(gx + 0.7, gy - 0.6), iso(gx + 0.7, gy + 0.6), iso(gx - 0.7, gy + 0.6)])} fill="none" stroke="#d9dbe1" strokeDasharray="4 5" strokeWidth={1.5} strokeLinejoin="round" />
    case 'inbox': {
      const [x, y] = iso(gx, gy, 26)
      return (
        <>
          <Block gx={gx} gy={gy} w={1.3} d={1.3} h={10} color={color} r={8} />
          <Block gx={gx} gy={gy} w={0.6} d={0.8} h={12} z={10} color="#6aa8ff" r={6} />
          <g transform={`translate(${x - 7},${y - 6})`}><g className={status === 'done' ? undefined : 'float'}>
            <rect width={14} height={10} rx={2} fill="#fff" stroke="#c9d6f2" />
            <path d="M0 0 L7 6 L14 0" fill="none" stroke="#c9d6f2" />
          </g></g>
        </>
      )
    }
    case 'think': {
      const [x, y] = iso(gx, gy, 46)
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.6} h={10} color={color} r={9} />
          <Block gx={gx} gy={gy} w={0.9} d={0.9} h={16} z={10} color="#b08cff" r={7} />
          <g transform={`translate(${x},${y})`} className={on ? 'pulse-glow' : undefined}>
            <circle r={8} fill={on ? '#fff36b' : '#fff8c9'} stroke="#f1d54a" />
            <rect x={-3} y={7} width={6} height={4} rx={1.5} fill="#c9ccd3" />
            {on && <circle r={13} fill="none" stroke="#fff36b" strokeWidth={2} opacity={0.6} className="ripple" />}
          </g>
        </>
      )
    }
    case 'board': {
      const a = iso(gx - 0.5, gy - 0.6, 12), b = iso(gx + 0.5, gy - 0.6, 12), c = iso(gx + 0.5, gy - 0.6, 44), d = iso(gx - 0.5, gy - 0.6, 44)
      const notes = [PINK, LIME, '#6aa8ff', '#ffc94d', '#b08cff', '#4fd1c5']
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.6} h={10} color={color} r={9} />
          <polygon points={pts([a, b, c, d])} fill="#ffffff" stroke="#ffd0e4" strokeWidth={4} strokeLinejoin="round" />
          {notes.map((n, i) => {
            const [nx, ny] = iso(gx - 0.35 + (i % 3) * 0.33, gy - 0.6, 36 - Math.floor(i / 3) * 12)
            return <rect key={i} x={nx - 4} y={ny - 4} width={8} height={7} rx={1.5} fill={n} className={on && i === tick % 6 ? 'hop' : undefined} />
          })}
        </>
      )
    }
    case 'gate': {
      const [x, y] = iso(gx + 0.1, gy + 0.1, 30)
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.6} h={10} color={color} r={9} />
          <Block gx={gx} gy={gy} w={0.9} d={0.6} h={10} z={10} color="#ffc94d" r={6} />
          <g transform={`translate(${x},${y})`}><g className={on ? 'swing' : undefined}>
            <circle cx={0} cy={0} r={7} fill="rgba(200,230,255,.7)" stroke="#5b6573" strokeWidth={2.5} />
            <rect x={4} y={4} width={9} height={3} rx={1.5} transform="rotate(45 4 4)" fill="#5b6573" />
          </g></g>
        </>
      )
    }
    case 'worker':
      return (
        <>
          <Block gx={gx} gy={gy} w={1.4} d={1.1} h={8} color={color} r={8} />
          <Block gx={gx + 0.15} gy={gy - 0.1} w={0.55} d={0.4} h={2} z={8} color="#ffffff" r={3} />
          <polygon points={pts([iso(gx + 0.35, gy - 0.3, 10), iso(gx + 0.35, gy + 0.1, 10), iso(gx + 0.35, gy + 0.1, 20), iso(gx + 0.35, gy - 0.3, 20)])} fill={on ? '#2b2b3a' : '#5b6170'} stroke={on ? '#2b2b3a' : '#5b6170'} strokeWidth={2} strokeLinejoin="round" />
          {on && <polygon points={pts([iso(gx + 0.33, gy - 0.25, 11.5), iso(gx + 0.33, gy + 0.05, 11.5), iso(gx + 0.33, gy + 0.05, 18.5), iso(gx + 0.33, gy - 0.25, 18.5)])} fill={LIME} opacity={0.7} className="pulse-glow" />}
        </>
      )
    case 'stage': {
      const a = iso(gx - 0.6, gy - 0.7, 10), b = iso(gx + 0.6, gy - 0.7, 10), c = iso(gx + 0.6, gy - 0.7, 40), d = iso(gx - 0.6, gy - 0.7, 40)
      const [px, py] = iso(gx, gy, 10)
      return (
        <>
          <Block gx={gx} gy={gy} w={1.7} d={1.6} h={10} color={color} r={9} />
          <polygon points={pts([a, b, c, d])} fill="#ff7eb6" stroke="#ff7eb6" strokeWidth={4} strokeLinejoin="round" />
          <polygon points={pts([iso(gx - 0.35, gy - 0.7, 10), iso(gx + 0.35, gy - 0.7, 10), iso(gx + 0.35, gy - 0.7, 34), iso(gx - 0.35, gy - 0.7, 34)])} fill="#ffe6f1" />
          <Buddy x={px - 8} y={py + 2} color="#ffc94d" k={0.7} mood={on ? 'happy' : 'idle'} type="fluffy" />
          <Buddy x={px + 8} y={py + 6} color="#6aa8ff" k={0.7} mood={on ? 'work' : 'idle'} flip type="slime" />
        </>
      )
    }
    case 'printer': {
      const [x, y] = iso(gx, gy, 30)
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.6} h={10} color={color} r={9} />
          <Block gx={gx} gy={gy} w={1.0} d={0.9} h={14} z={10} color="#ffffff" r={7} />
          {['A', 'B', 'C'].map((l, i) => (
            <g key={l} transform={`translate(${x - 14 + i * 10},${y - 6 - i * 2})`}><g className={on ? 'print' : undefined} style={{ animationDelay: `${i * 0.3}s` }}>
              <rect width={9} height={11} rx={1.5} fill="#fff" stroke="#e1d6ff" />
              <text x={4.5} y={8} textAnchor="middle" className="paper-text">{l}</text>
            </g></g>
          ))}
        </>
      )
    }
    case 'library': {
      const books = ['#ff7eb6', '#6aa8ff', '#ffc94d', '#7bd389', '#b08cff', '#4fd1c5']
      const [dx, dy] = iso(gx + 0.25, gy - 0.25, 44)
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.6} h={10} color={color} r={9} />
          <Block gx={gx} gy={gy - 0.3} w={1.2} d={0.5} h={26} z={10} color="#ffffff" r={5} />
          {books.map((b, i) => {
            const [bx, by] = iso(gx - 0.45 + (i % 3) * 0.32, gy - 0.05, 30 - Math.floor(i / 3) * 12)
            return <rect key={i} x={bx - 3} y={by - 9} width={6} height={10} rx={1.5} fill={b} className={on && i === tick % 6 ? 'hop' : undefined} />
          })}
          {/* 웹 조사 안테나 */}
          <g transform={`translate(${dx},${dy})`}>
            <path d="M-7 0 A7 7 0 0 1 7 0 Z" fill="#ffffff" stroke="#9fb3c8" />
            <line x1={0} y1={0} x2={0} y2={6} stroke="#9fb3c8" strokeWidth={1.5} />
            {on && <circle r={10} fill="none" stroke="#4fd1c5" strokeWidth={1.5} className="ripple" />}
          </g>
        </>
      )
    }
    case 'loupe': {
      const [x, y] = iso(gx, gy, 32)
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.6} h={10} color={color} r={9} />
          <Block gx={gx} gy={gy} w={0.8} d={1.0} h={3} z={10} color="#ffffff" r={3} />
          <g transform={`translate(${x},${y})`}><g className={on ? 'swing' : undefined}>
            <circle r={9} fill="rgba(255,255,255,.6)" stroke="#ff9f6e" strokeWidth={3} />
            <text y={4} textAnchor="middle" fontSize={11}>🤔</text>
          </g></g>
        </>
      )
    }
    case 'polish': {
      const [x, y] = iso(gx, gy, 26)
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.6} h={10} color={color} r={9} />
          <Block gx={gx} gy={gy} w={0.7} d={0.7} h={10} z={10} color="#a6f43c" r={8} />
          <g transform={`translate(${x},${y})`}>
            {[0, 1, 2].map((i) => (
              <text key={i} x={-12 + i * 12} y={-4 - (i % 2) * 6} fontSize={10} className={on ? 'twinkle' : undefined} style={{ animationDelay: `${i * 0.3}s` }}>✨</text>
            ))}
          </g>
        </>
      )
    }
    case 'lab': {
      // 4-3-2 피라미드
      const tiers = [{ n: 4, z: 10, c: '#b08cff' }, { n: 3, z: 18, c: LIME }, { n: 2, z: 26, c: PINK }]
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.6} h={10} color={color} r={9} />
          {tiers.flatMap((t) =>
            Array.from({ length: t.n }, (_, i) => (
              <Block key={`${t.n}-${i}`} gx={gx + (i - (t.n - 1) / 2) * 0.3} gy={gy} w={0.26} d={0.5} h={8} z={t.z} color={t.c} r={3} />
            ))
          )}
          {on && <circle cx={iso(gx, gy, 46)[0]} cy={iso(gx, gy, 46)[1]} r={9} fill="none" stroke={PINK} strokeWidth={2} className="ripple" />}
        </>
      )
    }
    case 'tower':
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.6} h={10} color={color} r={9} />
          <Block gx={gx} gy={gy} w={0.5} d={0.5} h={40} z={10} color="#ffffff" r={6} />
          <Block gx={gx} gy={gy} w={1.3} d={1.3} h={5} z={50} color={on ? '#4f6bed' : '#9fb7ff'} r={10} />
        </>
      )
    case 'dock': {
      const [x, y] = iso(gx, gy, 28)
      const done = status === 'done'
      return (
        <>
          <Block gx={gx} gy={gy} w={1.6} d={1.4} h={10} color={color} r={9} />
          {[0, 1, 2].map((i) => <Block key={i} gx={gx} gy={gy} w={0.9} d={1} h={3} z={10 + i * 4} color={i === 2 && done ? '#fff1b8' : '#ffffff'} r={3} />)}
          {done && (
            <g transform={`translate(${x},${y})`}>
              {[PINK, LIME, '#6aa8ff', '#ffc94d', '#b08cff', PINK, LIME].map((c, i) => (
                <rect key={i} className="confetti" style={{ animationDelay: `${i * 0.18}s` }} x={-14 + i * 4.5} y={0} width={3} height={5} rx={1} fill={c} />
              ))}
            </g>
          )}
        </>
      )
    }
  }
}

/* ---------- 파이프라인 ---------- */
function Pipe({ path, color, active }: { path: Pt[]; color: string; active: boolean }) {
  const d = pathD(path.map(([x, y]) => iso(x, y, 1)))
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeOpacity={active ? 0.35 : 0.14} strokeWidth={active ? 14 : 11} strokeLinecap="round" strokeLinejoin="round" filter={active ? 'url(#glow)' : undefined} />
      <path d={d} fill="none" stroke={color} strokeOpacity={active ? 1 : 0.55} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={1.6} strokeDasharray="2 9" strokeLinecap="round" className={active ? 'flow' : undefined} />
    </g>
  )
}

/* ---------- 이름표 ---------- */
function Tag({ s, status, detail, selected, onClick }: { s: StationDef; status: NodeStatus; detail?: string; selected: boolean; onClick(): void }) {
  if (s.kind === 'ghost') return null
  const [x, y] = iso(s.gx, s.gy, 0)
  const title = s.title.length > 11 ? `${s.title.slice(0, 11)}…` : s.title
  const sub = (status === 'idle' || status === 'queued') && !detail ? s.sub : detail ?? STATUS_LABEL[status]
  const subText = sub.length > 16 ? `${sub.slice(0, 16)}…` : sub
  const w = 112
  const [tx, ty] = s.kind === 'worker' ? [x + 34, y - 6] : [x - w - 14, y + 18]
  return (
    <g className="tag-g" transform={`translate(${tx},${ty})`} onClick={onClick}>
      <rect width={w} height={34} rx={17} fill="#ffffff" stroke={selected ? PINK : 'rgba(30,30,60,.07)'} strokeWidth={selected ? 2 : 1} filter="url(#soft)" />
      <circle cx={15} cy={17} r={4.5} fill={STATUS_COLOR[status]} className={status === 'running' || status === 'waiting' ? 'blink' : undefined} />
      <text x={26} y={15} className="tag-title">{title}</text>
      <text x={26} y={27} className="tag-sub">{subText}</text>
    </g>
  )
}

/* ---------- 메인 ---------- */
export default function Factory({ live, selected, onSelect }: { live: LiveState; selected: string | null; onSelect(id: string): void }) {
  const stations = useMemo(() => layout(live.tasks), [live.tasks])
  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations])
  const status = (id: string): NodeStatus => live.nodes[id]?.status ?? 'idle'
  const running = live.status === 'running'

  const pipes = useMemo(() => {
    const get = (id: string) => byId.get(id)!
    const list: { key: string; path: Pt[]; from: string; to: string; color: string }[] = []
    const link = (a: string, b: string, color: string) => list.push({ key: `${a}>${b}`, path: route(get(a), get(b)), from: a, to: b, color })
    link('inbox', 'intake', PINK)
    link('intake', 'dispatch', PINK)
    for (const s of stations.filter((x) => x.kind === 'worker' || x.kind === 'ghost')) {
      link('dispatch', s.id, PINK)
      link(s.id, 'audit', LIME)
    }
    link('audit', 'factbook', LIME)
    link('factbook', 'simulate', LIME)
    link('simulate', 'insight', LIME)
    link('insight', 'synthesize', LIME)
    link('synthesize', 'review', PINK)
    link('review', 'refine', PINK)
    link('refine', 'clone', PINK)
    link('clone', 'deliver', LIME)
    return list
  }, [stations, byId])

  /* 확대·이동: 휠/핀치=확대, 두 손가락 스크롤·드래그=이동, 더블클릭=원위치 */
  const svgRef = useRef<SVGSVGElement>(null)
  type View = { k: number; x: number; y: number }
  const [viewState, setView] = useState<View | null>(null)
  const homeRef = useRef<View>({ k: 1, x: 0, y: 0 })
  const view = viewState ?? homeRef.current
  const viewRef = useRef(view)
  viewRef.current = view
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = cx
    pt.y = cy
    const m = svg.getScreenCTM()
    return m ? pt.matrixTransform(m.inverse()) : pt
  }
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const v = viewRef.current
    const k = Math.min(4, Math.max(0.5, v.k * factor))
    const p = toSvg(cx, cy)
    setView({ k, x: p.x - ((p.x - v.x) * k) / v.k, y: p.y - ((p.y - v.y) * k) / v.k })
  }
  const pan = (fn: (v: View) => View) => setView((v) => fn(v ?? homeRef.current))

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const mouseWheel = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0)
      if (e.ctrlKey || e.metaKey || mouseWheel) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))
      } else {
        const m = svg.getScreenCTM()
        const s = m ? 1 / m.a : 1
        pan((v) => ({ ...v, x: v.x - e.deltaX * s, y: v.y - e.deltaY * s }))
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) svgRef.current?.setPointerCapture(e.pointerId)
    d.moved = true
    const m = svgRef.current?.getScreenCTM()
    const s = m ? 1 / m.a : 1
    pan((v) => ({ ...v, x: d.vx + dx * s, y: d.vy + dy * s }))
  }
  const onPointerUp = () => {
    suppressClick.current = !!drag.current?.moved
    drag.current = null
  }
  const select = (id: string) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    onSelect(id)
  }

  // 말풍선 교체용 느린 시계 (2.5초)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 2500)
    return () => window.clearInterval(t)
  }, [])

  // 업무 배달원 애니메이션 루프
  const [now, setNow] = useState(() => performance.now())
  const raf = useRef(0)
  useEffect(() => {
    const lastBorn = Math.max(0, ...live.packets.map((p) => p.born))
    const loop = () => {
      const t = performance.now()
      setNow(t)
      if (t - lastBorn < PACKET_MS + 50) raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [live.packets])

  /* 캠퍼스 범위 */
  const ys = stations.map((s) => s.gy)
  const floor = { x0: -1.8, x1: 28.5, y0: Math.min(-7.4, Math.min(...ys) - 2), y1: VROW + 1.8 }
  const road = { x0: floor.x0 - 1.3, x1: floor.x1 + 1.3, y0: floor.y0 - 1.3, y1: floor.y1 + 1.3 }
  const lounge = { gx: floor.x0 + 3.4, gy: floor.y0 + 1.9 }
  const pool = { gx: 7, gy: road.y1 + 3.2 }

  const viewBox = useMemo(() => {
    // 캠퍼스(도로 포함)와 수영장이 꽉 차도록 맞춘다
    const corners = [iso(road.x0, road.y0, 70), iso(road.x1, road.y1), iso(road.x0, road.y1), iso(road.x1, road.y0), iso(pool.gx - 3, pool.gy + 2)]
    const xs = corners.map((p) => p[0]), yy = corners.map((p) => p[1])
    return `${Math.min(...xs) - 20} ${Math.min(...yy) - 20} ${Math.max(...xs) - Math.min(...xs) + 40} ${Math.max(...yy) - Math.min(...yy) + 50}`
  }, [road.x0, road.x1, road.y0, road.y1, pool.gx, pool.gy])

  {
    const [vx, vy, vw, vh] = viewBox.split(' ').map(Number)
    const [tx, ty] = iso(14.5, 2.8)
    const k = 1.3
    homeRef.current = { k, x: vx + vw / 2 - tx * k, y: vy + vh / 2 - ty * k }
  }

  const sorted = [...stations].sort((a, b) => a.gx + a.gy - (b.gx + b.gy))
  const roadPath = pathD([iso(road.x0, road.y0), iso(road.x1, road.y0), iso(road.x1, road.y1), iso(road.x0, road.y1)]) + ' Z'
  const [lx, ly] = iso(lounge.gx, lounge.gy, 12)
  const mpmBossy = running || !!live.questions

  // 사무실을 오가는 커피 인턴 경로
  const internPath = pathD([iso(4.5, 1.6), iso(15, 1.6), iso(15, floor.y1 - 0.6), iso(4.5, floor.y1 - 0.6)]) + ' Z'

  return (
    <div className="factory-wrap">
    <svg
      ref={svgRef}
      className={`factory${drag.current?.moved ? ' grabbing' : ''}`}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onDoubleClick={() => setView(null)}
    >
      <defs>
        <filter id="soft" x="-20%" y="-30%" width="140%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#2b2b3a" floodOpacity="0.10" />
        </filter>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <linearGradient id="water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fe3ff" />
          <stop offset="1" stopColor="#4fc3f7" />
        </linearGradient>
      </defs>
      <g transform={`translate(${view.x.toFixed(1)},${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`}>

      {/* 하늘의 구름 */}
      {[0, 1].map((i) => {
        const [cx, cy] = iso(road.x0 + 4 + i * 10, road.y0 - 3 - i, 70)
        return (
          <g key={i} transform={`translate(${cx},${cy})`}><g className="cloud" style={{ animationDelay: `${-i * 9}s` }}>
            <ellipse cx={0} cy={0} rx={26} ry={10} fill="#ffffff" stroke="#eef1f7" />
            <ellipse cx={14} cy={-6} rx={16} ry={10} fill="#ffffff" />
            <ellipse cx={-12} cy={-4} rx={12} ry={8} fill="#ffffff" />
          </g></g>
        )
      })}

      {/* 잔디 + 도로 */}
      <polygon points={pts([iso(road.x0 - 1, road.y0 - 1), iso(road.x1 + 1, road.y0 - 1), iso(road.x1 + 1, road.y1 + 6), iso(road.x0 - 1, road.y1 + 6)])} fill="#f1fbe9" stroke="#f1fbe9" strokeWidth={30} strokeLinejoin="round" />
      <path d={roadPath} fill="none" stroke="#e6e8ee" strokeWidth={22} strokeLinejoin="round" />
      <path d={roadPath} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="8 10" />

      {/* 수영장 */}
      <g>
        <Block gx={pool.gx} gy={pool.gy} w={5} d={2.6} h={4} color="#e9f7ff" r={14} />
        <polygon points={pts([iso(pool.gx - 2.2, pool.gy - 1.1, 4), iso(pool.gx + 2.2, pool.gy - 1.1, 4), iso(pool.gx + 2.2, pool.gy + 1.1, 4), iso(pool.gx - 2.2, pool.gy + 1.1, 4)])} fill="url(#water)" stroke="#8fe3ff" strokeWidth={10} strokeLinejoin="round" />
        {[[-1.2, -0.2, '#ffc94d'], [0.6, 0.4, '#ff7eb6'], [1.5, -0.4, '#7bd389']].map(([dx, dy, c], i) => {
          const [sx, sy] = iso(pool.gx + (dx as number), pool.gy + (dy as number), 6)
          return (
            <g key={i} transform={`translate(${sx},${sy})`}><g className="swim" style={{ animationDelay: `${i * 0.6}s` }}>
              <ellipse cx={0} cy={2} rx={9} ry={3} fill="none" stroke="#ffffff" strokeOpacity={0.8} className="ripple" />
              <circle cx={0} cy={-3} r={5.5} fill={c as string} />
              <circle cx={-1.8} cy={-4} r={0.9} fill="#2b2b3a" />
              <circle cx={1.8} cy={-4} r={0.9} fill="#2b2b3a" />
            </g></g>
          )
        })}
        {(() => {
          const [fx, fy] = iso(pool.gx - 0.2, pool.gy + 0.6, 6)
          return (
            <g transform={`translate(${fx},${fy})`}><g className="swim">
              <ellipse cx={0} cy={0} rx={9} ry={4.5} fill="none" stroke="#ff7eb6" strokeWidth={4} />
            </g></g>
          )
        })()}
        {(() => {
          const [bx, by] = iso(pool.gx + 3.4, pool.gy - 0.2, 0)
          return (
            <g>
              <rect x={bx - 14} y={by - 6} width={28} height={8} rx={4} fill="#ffd8e8" />
              <Buddy x={bx} y={by - 2} color="#b08cff" k={0.9} mood="sleep" glasses type="slime" />
              <Bubble x={bx} y={by - 26} text="퇴근 후 MIN 🍹" tone="pink" />
            </g>
          )
        })()}
      </g>

      {/* 야자수 */}
      {[[road.x0 - 0.4, road.y1 + 1.6], [road.x1 + 0.2, road.y0 + 1], [road.x1 - 2, road.y1 + 2.6]].map(([gx, gy], i) => {
        const [tx, ty] = iso(gx, gy)
        return (
          <g key={i} transform={`translate(${tx},${ty})`}><g className="sway" style={{ animationDelay: `${i * 0.8}s` }}>
            <rect x={-2} y={-34} width={4} height={34} rx={2} fill="#d9a066" />
            {[-60, -20, 20, 60, 180].map((r) => <ellipse key={r} cx={0} cy={-34} rx={14} ry={4.5} fill="#7bd389" transform={`rotate(${r} 0 -34) translate(10 0)`} />)}
          </g></g>
        )
      })}

      {/* 스포츠카 */}
      <g>
        <g>
          <animateMotion dur="16s" repeatCount="indefinite" rotate="auto" path={roadPath} />
          <rect x={-14} y={-6} width={28} height={12} rx={5} fill="#ff3b3b" />
          <rect x={-5} y={-4.5} width={10} height={9} rx={3} fill="#ffd2d2" />
          <rect x={10} y={-5} width={3} height={3} rx={1} fill="#fff6a8" />
          <rect x={10} y={2} width={3} height={3} rx={1} fill="#fff6a8" />
          <circle cx={-8} cy={-7} r={2.8} fill="#2b2b3a" />
          <circle cx={8} cy={-7} r={2.8} fill="#2b2b3a" />
          <circle cx={-8} cy={7} r={2.8} fill="#2b2b3a" />
          <circle cx={8} cy={7} r={2.8} fill="#2b2b3a" />
        </g>
      </g>

      {/* 캠퍼스 바닥 */}
      <Block gx={(floor.x0 + floor.x1) / 2} gy={(floor.y0 + floor.y1) / 2} w={floor.x1 - floor.x0} d={floor.y1 - floor.y0} h={8} color="#ffffff" r={24} />
      <text {...(() => { const [x, y] = iso(floor.x0 + 0.6, floor.y1 - 0.2, 8); return { x, y } })()} className="campus-sign">LIKE MIN HQ</text>

      {/* MPM 라운지 */}
      <g className="station" onClick={() => select('intake')}>
        <Block gx={lounge.gx} gy={lounge.gy} w={4.4} d={2.4} h={12} z={8} color="#fff4fa" r={16} />
        <Block gx={lounge.gx - 0.2} gy={lounge.gy + 0.1} w={2.2} d={0.9} h={8} z={20} color="#ff7eb6" r={10} />
        <Block gx={lounge.gx - 0.2} gy={lounge.gy - 0.35} w={2.2} d={0.3} h={18} z={20} color="#ff5ca8" r={8} />
        <Block gx={lounge.gx + 1.5} gy={lounge.gy + 0.3} w={0.6} d={0.6} h={8} z={20} color="#ffffff" r={6} />
        <Buddy x={lx - 8} y={ly - 8} color="#ffb35c" k={1.7} mood={mpmBossy ? 'boss' : 'idle'} glasses type="fluffy" led={live.questions ? '#4f6bed' : undefined}>
          <g transform="translate(9,-12) rotate(-25)">
            <rect x={0} y={-2} width={9} height={5} rx={2} fill={PINK} />
            <path d="M9 -3 L14 -6 L14 6 L9 3 Z" fill={PINK} />
          </g>
        </Buddy>
        {(() => {
          const [cx, cy] = iso(lounge.gx + 1.5, lounge.gy + 0.3, 30)
          return <text x={cx} y={cy} textAnchor="middle" fontSize={11}>☕</text>
        })()}
        <Bubble x={lx - 8} y={ly - 48} text={mpmLine(live)} tone={live.questions ? 'blue' : 'white'} />
        {(() => {
          const [tx, ty] = iso(lounge.gx, lounge.gy + 1.2, 20)
          return (
            <g transform={`translate(${tx - 30},${ty + 6})`}>
              <rect width={60} height={18} rx={9} fill="#2b2b3a" />
              <text x={30} y={12.5} textAnchor="middle" className="mpm-sign">MPM</text>
            </g>
          )
        })()}
      </g>

      {/* MPM의 지시선 */}
      {(['intake', 'dispatch', 'audit', 'synthesize', 'review', 'refine'] as const).map((id) => {
        const s = byId.get(id)!
        const a = iso(lounge.gx, lounge.gy + 1.2, 20), b = iso(s.gx, s.gy, 30)
        const hot = status(id) === 'running' || status(id) === 'waiting'
        return <path key={id} d={`M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2} ${Math.min(a[1], b[1]) - 30} ${b[0]} ${b[1]}`} fill="none" stroke={hot ? PINK : '#e9d6e2'} strokeWidth={hot ? 2 : 1.2} strokeDasharray="3 6" className={hot ? 'flow' : undefined} />
      })}

      {/* 파이프라인 */}
      {pipes.map((p) => (
        <Pipe key={p.key} path={p.path} color={p.color} active={status(p.to) === 'running' || (status(p.from) === 'running' && p.from !== 'audit')} />
      ))}

      {/* 스테이션 */}
      {sorted.map((s) => (
        <g key={s.id} className="station" onClick={() => s.kind !== 'ghost' && select(s.id)}>
          {status(s.id) !== 'idle' && s.kind !== 'ghost' && (
            <polygon
              className={status(s.id) === 'running' || status(s.id) === 'waiting' ? 'ring-run' : undefined}
              points={pts([iso(s.gx - 1.0, s.gy - 1.0, 8.5), iso(s.gx + 1.0, s.gy - 1.0, 8.5), iso(s.gx + 1.0, s.gy + 1.0, 8.5), iso(s.gx - 1.0, s.gy + 1.0, 8.5)])}
              fill="none"
              stroke={STATUS_COLOR[status(s.id)]}
              strokeWidth={2}
              strokeLinejoin="round"
              opacity={0.75}
            />
          )}
          <g transform="translate(0,-8)">
            <Prop s={s} status={status(s.id)} tick={tick} />
          </g>
        </g>
      ))}

      {/* 하위 담당 캐릭터 */}
      {sorted.filter((s) => s.kind === 'worker').map((s, i) => {
        const st = status(s.id)
        const [x, y] = iso(s.gx - 0.45, s.gy + 0.35, 16)
        const color = CHAR[(hash(s.id) + i) % CHAR.length]
        const roleId = live.tasks.find((t) => `worker:${t.id}` === s.id)?.roleId ?? ''
        const type = ROLE_AGENT[roleId] ?? agentTypeOf(s.id)
        const mood = st === 'running' ? 'work' : st === 'rework' ? 'sad' : st === 'done' ? 'happy' : 'sleep'
        const pool_ = st === 'running' ? WORKER_LINES : st === 'rework' ? REWORK_LINES : st === 'done' ? DONE_LINES : IDLE_LINES
        const line = pool_[(hash(s.id) + tick) % pool_.length]
        const showBubble = st === 'rework' || ((tick + i) % 3 !== 0 && (st === 'running' || st === 'done')) || (st !== 'running' && st !== 'done' && (tick + i) % 4 === 0)
        return (
          <g key={`b-${s.id}`} className="station" onClick={() => select(s.id)}>
            <Buddy x={x} y={y} color={color} mood={mood} type={type} />
            <text x={x} y={y + 9} textAnchor="middle" className="agent-name">{AGENT_NAME[type]}</text>
            {showBubble && <Bubble x={x} y={y - 20} text={line} tone={st === 'rework' ? 'pink' : 'white'} />}
          </g>
        )
      })}

      {/* 검수 탐정 */}
      {(() => {
        const s = byId.get('audit')!
        const st = status(s.id)
        const [x, y] = iso(s.gx - 0.55, s.gy + 0.55, 16)
        const reject = Object.values(live.nodes).some((n) => n.status === 'rework')
        return (
          <g>
            <Buddy x={x} y={y} color="#ffc94d" mood={st === 'running' ? 'work' : 'idle'} glasses type="spiky" />
            {st === 'running' && <Bubble x={x} y={y - 20} text={reject ? '반려! 근거 가져와 🔍' : tick % 2 ? '이거 출처 있어?' : '음… 승인!'} tone={reject ? 'pink' : 'white'} />}
          </g>
        )
      })()}

      {/* MPM 클론 — 전망대 위의 홀로그램 디렉터 */}
      {(() => {
        const s = byId.get('clone')!
        const st = status('clone')
        const [x, y] = iso(s.gx, s.gy, 63)
        const directive = st === 'running' && live.nodes.clone?.detail?.includes('직권')
        const line = directive ? '직권 지시! 한 번에 정리한다 📣' : st === 'running' ? '숲을 보자 🔭' : st === 'done' ? (live.record?.verification?.clone?.bigIssue ? '방향 잡았다 👍' : '큰 그림 OK 👌') : tick % 3 === 0 ? '(대기 중… 망원경 닦는 중)' : ''
        return (
          <g className="station hologram" onClick={() => select('clone')}>
            <Buddy x={x} y={y} color="#9fb7ff" k={1.3} mood={st === 'running' ? 'boss' : 'idle'} glasses type="fluffy" led="#4f6bed">
              <g transform="translate(7,-16)">
                <rect x={0} y={-3} width={4} height={6} rx={1.5} fill="#2b2b3a" />
                <rect x={4.5} y={-3} width={4} height={6} rx={1.5} fill="#2b2b3a" />
              </g>
            </Buddy>
            <text x={x} y={y + 11} textAnchor="middle" className="agent-name">MPM 클론</text>
            {line && <Bubble x={x} y={y - 46} text={line} tone={directive ? 'blue' : 'white'} />}
          </g>
        )
      })()}

      {/* 커피 인턴 */}
      {running && (
        <g>
          <animateMotion dur="22s" repeatCount="indefinite" path={internPath} />
          <Buddy x={0} y={0} color="#4fd1c5" k={0.8} mood="run" carry="#d9a066" type="blocky" />
        </g>
      )}

      {/* 업무 배달원 (패킷) */}
      {live.packets.map((p) => {
        const a = byId.get(p.from), b = byId.get(p.to)
        const age = (now - p.born) / PACKET_MS
        if (!a || !b || age > 1) return null
        const path = p.kind === 'rework' ? route(b, a).reverse() : route(a, b)
        const ease = age < 0.5 ? 2 * age * age : 1 - Math.pow(-2 * age + 2, 2) / 2
        const [gx, gy] = pointAlong(path, ease)
        const [gx2, gy2] = pointAlong(path, Math.min(1, ease + 0.02))
        const dirLeft = iso(gx2, gy2)[0] < iso(gx, gy)[0]
        const [x, y] = iso(gx, gy, 2)
        const color = CHAR[p.id % CHAR.length]
        return (
          <g key={p.id}>
            <Buddy x={x} y={y} color={color} k={0.85} mood={p.kind === 'rework' ? 'sad' : 'run'} carry={PACKET_COLOR[p.kind]} flip={dirLeft} type={agentTypeOf(p.id)} />
            {p.kind === 'rework' && age < 0.6 && <Bubble x={x} y={y - 34} text="다시 해 오래요 ㅠ" tone="pink" />}
            {p.kind === 'final' && p.to === 'deliver' && age < 0.7 && <Bubble x={x} y={y - 34} text="최종본 배달~ 🚀" />}
            {p.kind === 'directive' && age < 0.8 && <Bubble x={x} y={y - 34} text="클론 지시 들고 갑니다!" tone="blue" />}
            {p.kind === 'fact' && age < 0.5 && <Bubble x={x} y={y - 34} text="팩트 배달 📚" />}
          </g>
        )
      })}

      {/* 이름표 */}
      {sorted.map((s) => (
        <Tag key={`t-${s.id}`} s={s} status={status(s.id)} detail={live.nodes[s.id]?.detail} selected={selected === s.id} onClick={() => select(s.id)} />
      ))}
      </g>
    </svg>
    <div className="zoom-ctl">
      <button title="확대" onClick={() => { const r = svgRef.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25) }}>＋</button>
      <button title="축소" onClick={() => { const r = svgRef.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8) }}>－</button>
      <button title="기본 보기 (더블클릭)" onClick={() => setView(null)}>⌂</button>
      <button title="캠퍼스 전체" onClick={() => setView({ k: 1, x: 0, y: 0 })}>⤢</button>
      <span>{Math.round(view.k * 100)}%</span>
    </div>
    </div>
  )
}
