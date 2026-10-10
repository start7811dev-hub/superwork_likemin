import { useState } from 'react'
import { MIN_CHECKS, type ChallengeQuestion } from '@shared/schemas'

/** 의도가 정말 불분명할 때만 MPM이 비유로 묻는 패널 */
export default function QuestionGate({ reading, items, onSubmit }: { reading: string; items: ChallengeQuestion[]; onSubmit(a: string[] | null): void }) {
  const [answers, setAnswers] = useState<string[]>(() => items.map(() => ''))
  const any = answers.some((a) => a.trim())
  return (
    <div className="gate">
      <div className="gate-head">
        <span className="gate-badge">MPM의 의도 질문</span>
        <span className="muted small">의도가 잡히면 묻지 않습니다. 이번엔 정말 헷갈려서, 비유로 여쭤봐요.</span>
      </div>
      {reading && (
        <div className="kv">
          <span className="kv-k">읽힌 의도</span>
          <span>{reading}</span>
        </div>
      )}
      <ol className="gate-list">
        {items.map((q, i) => (
          <li key={i}>
            <div className="q">
              {q.question}
              <span className="tag">{MIN_CHECKS[q.checkpoint as keyof typeof MIN_CHECKS] ?? '의도'}</span>
            </div>
            <div className="analogy"><span className="kv-k">비유</span><span>{q.analogy}</span></div>
            <div className="small muted">왜 묻나: {q.why}</div>
            <textarea
              value={answers[i]}
              placeholder={`비워 두면 가정: ${q.ifUnanswered}`}
              onChange={(e) => setAnswers(answers.map((a, k) => (k === i ? e.target.value : a)))}
            />
          </li>
        ))}
      </ol>
      <div className="row">
        <button className="ghost" onClick={() => onSubmit(null)}>가정대로 진행</button>
        <button className="primary run" onClick={() => onSubmit(answers)} disabled={!any}>답변하고 계속</button>
      </div>
    </div>
  )
}
