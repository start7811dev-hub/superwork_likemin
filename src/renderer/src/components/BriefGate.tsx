import { useState } from 'react'
import type { Brief } from '@shared/schemas'
import { BriefCard } from './Report'

/** 결과물을 만들기 전에 MIN이 1장 브리프를 승인하거나 방향을 고친다 */
export default function BriefGate({ brief, onSubmit }: { brief: Brief; onSubmit(a: string[] | null): void }) {
  const [note, setNote] = useState('')
  return (
    <div className="gate brief-gate">
      <div className="gate-head">
        <span className="gate-badge">1장 브리프 승인</span>
        <span className="muted small">이 브리프대로 결과물을 만듭니다. 방향이 다르면 한 줄로 알려 주세요.</span>
      </div>
      <BriefCard b={brief} />
      <div className="gate-foot">
        <textarea value={note} placeholder="고칠 방향 (예: 통찰이 무난하다, 이 맥락을 더 세게 써라)" onChange={(e) => setNote(e.target.value)} />
        <div className="row">
          <button className="ghost" disabled={!note.trim()} onClick={() => onSubmit([note])}>이 방향으로 고쳐서 제작</button>
          <button className="primary run" onClick={() => onSubmit(null)}>이대로 제작</button>
        </div>
      </div>
    </div>
  )
}
