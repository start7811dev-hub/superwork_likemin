import { useState } from 'react'
import type { ReviewCard } from '@shared/schemas'
import { ROUND_ANSWERS, type RoundAnswerKind } from '@shared/types'

/** 회차 사이의 리뷰 카드: 네 줄을 읽고 한마디로 방향을 튼다 */
export default function CardGate({
  round,
  maxRounds,
  card,
  stopHint,
  last,
  onSubmit
}: {
  round: number
  maxRounds: number
  card: ReviewCard
  stopHint?: string
  last: boolean
  onSubmit(a: string[] | null): void
}) {
  const [text, setText] = useState('')
  const send = (k: Exclude<RoundAnswerKind, 'auto'>) => onSubmit([k, text])
  return (
    <div className="gate card-gate">
      <div className="gate-head">
        <span className="gate-badge">리뷰 카드 · {round}/{maxRounds}회차</span>
        <span className="muted small">한마디로 답해 주세요. 답이 다음 회차의 방향이 됩니다.</span>
      </div>
      <dl className="card-dl">
        <div><dt>지금 안</dt><dd>{card.current}</dd></div>
        <div><dt>걸리는 것</dt><dd>{card.snag}</dd></div>
        <div className="q"><dt>찌르는 질문</dt><dd>{card.question}</dd></div>
        <div><dt>넣으면</dt><dd>{card.ifYes}</dd></div>
      </dl>
      {stopHint && <p className="small muted">편집장: 여기서 멈춰도 됩니다 — {stopHint}</p>}
      {last && <p className="small muted">마지막 회차입니다. 어떤 답이든 이 안으로 브리프를 씁니다.</p>}
      <div className="gate-foot">
        <textarea className="short" value={text} placeholder="덧붙일 말 ('아니다'면 다른 방향을 적어 주세요)" onChange={(e) => setText(e.target.value)} />
        <div className="row wrap">
          <button className="ghost" onClick={() => send('stop')}>{ROUND_ANSWERS.stop}</button>
          <button className="ghost" disabled={!text.trim()} onClick={() => send('no')}>{ROUND_ANSWERS.no}</button>
          <button className="ghost" onClick={() => send('half')}>{ROUND_ANSWERS.half}</button>
          <button className="primary run" onClick={() => send('go')}>{ROUND_ANSWERS.go}</button>
        </div>
      </div>
    </div>
  )
}
