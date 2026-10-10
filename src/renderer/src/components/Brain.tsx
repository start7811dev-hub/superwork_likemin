import { useEffect, useState } from 'react'
import type { BrainSnapshot, RoleDef } from '@shared/types'
import { api } from '../api'

type Tab = 'doctrine' | 'identity' | 'knowledge' | 'roster' | 'memory'

export default function Brain({ onToast }: { onToast(m: string): void }) {
  const [b, setB] = useState<BrainSnapshot | null>(null)
  const [tab, setTab] = useState<Tab>('doctrine')
  const [doctrine, setDoctrine] = useState('')
  const [roster, setRoster] = useState('')
  const [newName, setNewName] = useState('')
  const [newBody, setNewBody] = useState('')
  const [openFile, setOpenFile] = useState<string | null>(null)

  const reload = async () => {
    const snap = await api.brain.get()
    setB(snap)
    setDoctrine(snap.doctrine)
    setRoster(JSON.stringify(snap.roles, null, 2))
  }
  useEffect(() => {
    void reload()
  }, [])
  if (!b) return null

  const saveDoctrine = async () => {
    await api.brain.saveDoctrine(doctrine)
    onToast('교리를 저장했습니다. 다음 실행부터 적용됩니다.')
    void reload()
  }
  const saveRoster = async () => {
    try {
      const roles = JSON.parse(roster) as RoleDef[]
      if (!Array.isArray(roles) || roles.some((r) => !r.id || !r.name || !r.mission)) throw new Error('각 역할에 id, name, mission이 필요합니다.')
      await api.brain.saveRoster(roles)
      onToast('담당 구성을 저장했습니다.')
      void reload()
    } catch (e) {
      onToast(`저장 실패: ${(e as Error).message}`)
    }
  }
  const addKnowledge = async () => {
    if (!newName.trim() || !newBody.trim()) return
    await api.brain.addKnowledge(newName, newBody)
    setNewName('')
    setNewBody('')
    onToast('지식을 추가했습니다.')
    void reload()
  }

  const files = tab === 'identity' ? b.identity : b.knowledge

  return (
    <div className="brain">
      <div className="brain-head">
        <div>
          <div className="eyebrow">LIKE MIN BRAIN · v{b.version}</div>
          <h2>MIN의 두뇌</h2>
          <p className="muted">MPM과 모든 하위 담당은 이 두뇌로 생각합니다. 번들 두뇌는 앱 업데이트로 갱신되고, 여기서 수정·추가한 내용은 업데이트 후에도 유지됩니다.</p>
        </div>
        <button className="ghost" onClick={() => api.brain.openFolder()}>두뇌 폴더 열기</button>
      </div>

      <nav className="tabs">
        {([['doctrine', '운영 교리'], ['identity', '정체성'], ['knowledge', '지식'], ['roster', '담당 구성'], ['memory', `결정 메모리 (${b.memory.length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      {tab === 'doctrine' && (
        <div className="editor">
          <p className="muted small">{b.doctrineOverridden ? '사용자 수정본을 사용 중입니다.' : '번들 기본 교리를 사용 중입니다.'}</p>
          <textarea value={doctrine} onChange={(e) => setDoctrine(e.target.value)} spellCheck={false} />
          <div className="row">
            <button className="primary" onClick={saveDoctrine}>저장</button>
            {b.doctrineOverridden && <button className="ghost" onClick={async () => { await api.brain.saveDoctrine(null); void reload(); onToast('기본 교리로 복원했습니다.') }}>기본값 복원</button>}
          </div>
        </div>
      )}

      {(tab === 'identity' || tab === 'knowledge') && (
        <div className="files">
          {files.length === 0 && <p className="muted">아직 없습니다.</p>}
          {files.map((f) => (
            <div key={f.name} className="file">
              <div className="file-head" onClick={() => setOpenFile(openFile === f.name ? null : f.name)}>
                <b>{f.name}</b>
                <span className="tag">{f.source === 'bundled' ? '기본' : '사용자'}</span>
                <span className="muted small">{f.content.length.toLocaleString()}자</span>
                {f.source === 'user' && tab === 'knowledge' && (
                  <button className="link" onClick={async (e) => { e.stopPropagation(); await api.brain.removeKnowledge(f.name); void reload() }}>삭제</button>
                )}
              </div>
              {openFile === f.name && <pre className="file-body">{f.content}</pre>}
            </div>
          ))}
          {tab === 'knowledge' && (
            <div className="add">
              <h4>지식 추가</h4>
              <p className="muted small">과거 프로젝트 회고, 업종 노하우, 브랜드 가이드, 판단 원칙 등. 모든 담당에게 배경 지식으로 주입됩니다.</p>
              <input placeholder="파일 이름 (예: 2025-리브랜딩-회고)" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <textarea placeholder="내용 (마크다운)" value={newBody} onChange={(e) => setNewBody(e.target.value)} />
              <div className="row">
                <button className="primary" onClick={addKnowledge}>추가</button>
                <button className="ghost" onClick={async () => { const n = await api.brain.importKnowledge(); if (n) { onToast(`${n}개 파일을 가져왔습니다.`); void reload() } }}>파일에서 가져오기</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'roster' && (
        <div className="editor">
          <div className="roles">
            {b.roles.map((r) => (
              <div key={r.id} className="role">
                <b>{r.name}</b> <span className="tag">{r.id}</span> <span className="muted small">{r.tier === 'light' ? '경량' : '작업'}{r.research ? ' · 리서치' : ''}</span>
                <p className="small">{r.mission}</p>
              </div>
            ))}
          </div>
          <details>
            <summary>JSON으로 편집 (담당 추가·수정)</summary>
            <textarea className="mono" value={roster} onChange={(e) => setRoster(e.target.value)} spellCheck={false} />
            <div className="row">
              <button className="primary" onClick={saveRoster}>저장</button>
              {b.rosterOverridden && <button className="ghost" onClick={async () => { await api.brain.saveRoster(null); void reload() }}>기본값 복원</button>}
            </div>
          </details>
        </div>
      )}

      {tab === 'memory' && (
        <div className="files">
          <p className="muted small">리포트에서 기록한 MIN의 실제 결정입니다. 최근 8개가 MPM의 판단 참고 자료로 쓰입니다.</p>
          {b.memory.length === 0 && <p className="muted">아직 기록된 결정이 없습니다.</p>}
          {b.memory.map((m) => (
            <div key={m.runId} className="file">
              <div className="file-head">
                <b>{m.title}</b>
                <span className="tag">{m.chosen}</span>
                <span className="muted small">{m.at.slice(0, 10)}</span>
                <button className="link" onClick={async () => { await api.brain.removeMemory(m.runId); void reload() }}>삭제</button>
              </div>
              {m.note && <p className="small" style={{ padding: '0 14px 12px' }}>{m.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
