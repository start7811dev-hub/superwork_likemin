import { useState } from 'react'
import type { RootIssue } from '@shared/schemas'

/** 가장 이른 시점에 MIN이 근본 이슈를 고르거나 고쳐 쓴다 */
export default function RootGate({ root, onSubmit }: { root: RootIssue; onSubmit(a: string[] | null): void }) {
  const first = Math.min(Math.max(0, root.recommended), root.candidates.length - 1)
  const [sel, setSel] = useState(first)
  const [issue, setIssue] = useState(root.candidates[first].issue)
  const [test, setTest] = useState(root.candidates[first].test)
  const choose = (i: number) => {
    setSel(i)
    setIssue(root.candidates[i].issue)
    setTest(root.candidates[i].test)
  }
  return (
    <div className="gate root-gate">
      <div className="gate-head">
        <span className="gate-badge">근본 이슈 확정</span>
        <span className="muted small">이후의 모든 안을 여기에 대입합니다. 빗나가면 뒤가 다 빗나가니, 가장 먼저 정합니다.</span>
      </div>
      <dl className="brief-dl">
        <div><dt>과업</dt><dd>{root.task}</dd></div>
        <div><dt>목적</dt><dd>{root.purpose}</dd></div>
      </dl>
      <ol className="root-list">
        {root.candidates.map((c, i) => (
          <li key={i} className={sel === i ? 'on' : ''} onClick={() => choose(i)}>
            <b>{c.issue}</b>
            <span className="small muted">판정 질문: {c.test}</span>
            <span className="small muted">{c.why}</span>
          </li>
        ))}
      </ol>
      <div className="gate-foot">
        <label className="small muted">근본 이슈 (누구의 무엇이 바뀌는가 — 고쳐 써도 됩니다)</label>
        <textarea value={issue} onChange={(e) => setIssue(e.target.value)} />
        <label className="small muted">판정 질문</label>
        <textarea className="short" value={test} onChange={(e) => setTest(e.target.value)} />
        <div className="row">
          <button className="ghost" onClick={() => onSubmit(null)}>MPM 추천으로</button>
          <button className="primary run" disabled={!issue.trim()} onClick={() => onSubmit([issue, test])}>이걸로 확정</button>
        </div>
      </div>
    </div>
  )
}
