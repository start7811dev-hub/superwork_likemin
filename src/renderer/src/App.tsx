import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { estimateCost, type AttachmentInfo, type Depth, type PipelineEvent, type RunSummary, type UpdateStatus } from '@shared/types'
import { api } from './api'
import { EMPTY, fromRecord, reduce, type LiveState } from './live'
import Factory from './components/Factory'
import BriefGate from './components/BriefGate'
import QuestionGate from './components/QuestionGate'
import CostBadge from './components/CostBadge'
import CostView from './components/CostView'
import Inspector from './components/Inspector'
import Report from './components/Report'
import Brain from './components/Brain'
import SettingsView from './components/SettingsView'

type View = 'factory' | 'report' | 'brain' | 'cost' | 'settings'

type Action = { type: 'event'; e: PipelineEvent } | { type: 'load'; state: LiveState }
const liveReducer = (s: LiveState, a: Action) => (a.type === 'load' ? a.state : reduce(s, a.e))

const DEPTHS: { id: Depth; label: string; hint: string }[] = [
  { id: 'quick', label: '빠르게', hint: '초안·방향 확인' },
  { id: 'standard', label: '표준', hint: '일반 기획 업무' },
  { id: 'deep', label: '깊게', hint: '고위험 의사결정' }
]

const EXAMPLES = [
  '30대 직장인 대상 구독형 밀키트 서비스를 3개월 안에 런칭하려 한다. 초기 고객 확보 전략을 기획해줘.',
  '우리 B2B SaaS의 무료→유료 전환율이 2%에서 정체다. 원인 가설과 개선 방향을 잡아줘.',
  '오프라인 중심 로컬 베이커리 브랜드를 MZ 대상으로 리브랜딩할지 판단하고 싶다.'
]

export default function App() {
  const [view, setView] = useState<View>('factory')
  const [live, dispatch] = useReducer(liveReducer, EMPTY)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [brief, setBrief] = useState('')
  const [depth, setDepth] = useState<Depth>('standard')
  const [hasKey, setHasKey] = useState(true)
  const [toast, setToast] = useState('')
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' })
  const [costPulse, setCostPulse] = useState(0)
  const [files, setFiles] = useState<AttachmentInfo[]>([])
  const [dragOver, setDragOver] = useState(false)
  const links = [...new Set(brief.match(/https?:\/\/[^\s<>"'`)\]}]+/g) ?? [])].map((u) => u.replace(/[.,;:!?]+$/, '')).slice(0, 5)
  const MAX_FILES = 5
  const addFiles = (more: AttachmentInfo[]) => {
    const merged = [...files, ...more.filter((m) => !files.some((f) => f.path === m.path))]
    if (merged.length > MAX_FILES) showToast(`참고 자료는 ${MAX_FILES}개까지 첨부할 수 있습니다`)
    setFiles(merged.slice(0, MAX_FILES))
  }
  const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)
  const liveRef = useRef(live)
  liveRef.current = live

  const refreshRuns = useCallback(() => void api.runs.list().then(setRuns), [])
  const showToast = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? '' : t)), 4200)
  }, [])

  useEffect(() => {
    refreshRuns()
    void api.settings.get().then((r) => setHasKey(r.hasKey))
    const offRun = api.runs.onEvent((e) => {
      dispatch({ type: 'event', e })
      if (e.type === 'usage' || (e.type === 'run' && e.status !== 'started')) setCostPulse(Date.now())
      if (e.type === 'node' && e.status === 'running') setSelected(e.nodeId)
      if (e.type === 'run' && e.status !== 'started') {
        refreshRuns()
        if (e.status === 'done') {
          setSelected('deliver')
          showToast('리포트가 완성되었습니다.')
        }
        if (e.status === 'error') showToast(`오류: ${e.error}`)
      }
    })
    const offUpd = api.updater.onStatus(setUpdate)
    return () => {
      offRun()
      offUpd()
    }
  }, [refreshRuns, showToast])

  const start = async (demo = false) => {
    const text = brief.trim() || (demo ? EXAMPLES[0] : '')
    if (!text) return
    if (!hasKey && !demo) {
      setView('settings')
      showToast('먼저 Claude API 키를 등록하세요.')
      return
    }
    try {
      // runId가 null인 동안 첫 'run started' 이벤트가 상태를 초기화하고 runId를 고정한다.
      dispatch({ type: 'load', state: EMPTY })
      await api.runs.start(text, depth, demo, files.map((f) => f.path))
      setSelected('inbox')
      setView('factory')
      setBrief('')
      setFiles([])
      refreshRuns()
    } catch (e) {
      dispatch({ type: 'load', state: EMPTY })
      showToast((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  const open = async (id: string) => {
    if (live.status === 'running' && live.runId === id) return setView('factory')
    const r = await api.runs.get(id)
    if (!r) return
    dispatch({ type: 'load', state: fromRecord(r) })
    setSelected(r.synthesis ? 'deliver' : 'intake')
    setView(r.synthesis ? 'report' : 'factory')
  }

  const remove = async (id: string) => {
    await api.runs.remove(id)
    if (live.runId === id) dispatch({ type: 'load', state: EMPTY })
    refreshRuns()
  }

  const running = live.status === 'running'

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">M</div>
          <div>
            <div className="brand-name">SUPER WORK</div>
            <div className="brand-sub">LIKE MIN</div>
          </div>
        </div>
        <button className="new" onClick={() => { if (!running) dispatch({ type: 'load', state: EMPTY }); setView('factory'); setSelected(null) }}>
          ＋ 새 업무 지시
        </button>
        <div className="eyebrow pad">기록</div>
        <ul className="runs">
          {runs.map((r) => (
            <li key={r.id} className={live.runId === r.id ? 'on' : ''} onClick={() => open(r.id)}>
              <span className={`dot st-${r.status}`} />
              <div className="run-meta">
                <div className="run-title">{r.title}</div>
                <div className="muted small">{new Date(r.createdAt).toLocaleDateString('ko-KR')} · {r.demo ? '데모' : `$${r.costUsd.toFixed(2)}`}</div>
              </div>
              <button className="x" title="삭제" onClick={(e) => { e.stopPropagation(); void remove(r.id) }}>×</button>
            </li>
          ))}
          {!runs.length && <li className="muted small empty-runs">아직 기록이 없습니다.</li>}
        </ul>
        {update.state === 'ready' && (
          <button className="update" onClick={() => api.updater.install()}>v{update.version} 설치 준비됨 · 재시작</button>
        )}
      </aside>

      <main className="main">
        <header className="topbar">
          <nav className="views">
            {([['factory', '공정'], ['report', '리포트'], ['brain', '두뇌'], ['cost', '비용'], ['settings', '설정']] as [View, string][]).map(([k, l]) => (
              <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
            ))}
          </nav>
          <CostBadge pulse={costPulse} onOpenSettings={() => setView('cost')} />
          <div className="status">
            {running && <span className="live-dot" />}
            <span className="muted small">
              {live.brief ? 'MPM이 브리프 승인을 기다리는 중' : live.questions ? 'MPM이 MIN의 답을 기다리는 중' : running ? 'MPM 공정 가동 중' : live.status === 'done' ? '완료' : live.status === 'error' ? '오류' : live.status === 'cancelled' ? '중단됨' : '대기'}
              {live.runId && ` · $${estimateCost(live.usage).toFixed(3)}`}
            </span>
          </div>
        </header>

        {view === 'factory' && (
          <div className="factory-view">
            <div className="stage">
              <Factory live={live} selected={selected} onSelect={setSelected} />
              {live.status === 'error' && <div className="error-banner">{live.error}</div>}
              {live.brief && live.runId && (
                <BriefGate key={live.brief.proposition} brief={live.brief} onSubmit={(ans) => void api.runs.answer(live.runId!, ans)} />
              )}
              {live.questions && live.runId && (
                <QuestionGate
                  key={live.questions.items.map((q) => q.question).join('|')}
                  reading={live.questions.reading}
                  items={live.questions.items}
                  onSubmit={(ans) => void api.runs.answer(live.runId!, ans)}
                />
              )}

              <div className="command">
                {live.status === 'idle' && !brief && (
                  <div className="examples">
                    {EXAMPLES.map((ex) => <button key={ex} className="chip" onClick={() => setBrief(ex)}>{ex.slice(0, 34)}…</button>)}
                  </div>
                )}
                <div
                  className={`command-box${dragOver ? ' drag' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); if (!running) setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={async (e) => {
                    e.preventDefault()
                    setDragOver(false)
                    if (running) return
                    const paths = [...e.dataTransfer.files].map((f) => api.files.pathFor(f)).filter(Boolean)
                    if (paths.length) addFiles(await api.files.info(paths))
                  }}
                >
                  {(files.length > 0 || links.length > 0) && (
                    <div className="attach-row">
                      {files.map((f) => (
                        <span key={f.path} className="attach">
                          <b>{f.ext.toUpperCase()}</b> {f.name} <span className="muted">{fmtSize(f.size)}</span>
                          <button title="빼기" onClick={() => setFiles(files.filter((x) => x.path !== f.path))}>×</button>
                        </span>
                      ))}
                      {links.map((u) => (
                        <span key={u} className="attach link">
                          <b>{/github\.com/.test(u) ? 'GIT' : 'URL'}</b> {u.replace(/^https?:\/\//, '').slice(0, 40)}
                          {!/github\.com/.test(u) && (
                            <button className="login" title="로그인이 필요한 페이지면 먼저 로그인하세요. 창을 닫으면 세션이 저장됩니다." onClick={() => void api.links.login(u)}>로그인</button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void start() }}
                    placeholder={running ? '공정이 진행 중입니다…' : 'MPM에게 업무를 지시하세요. 배경, 제약, 기한, 원하는 결과물을 자유롭게 적어 주세요. 링크(깃 주소 등)를 넣으면 열어서 분석하고, 파일은 끌어다 놓아 첨부할 수 있어요.'}
                    disabled={running}
                  />
                  <div className="command-foot">
                    <button className="ghost attach-btn" disabled={running || files.length >= MAX_FILES} onClick={async () => addFiles(await api.files.pick())} title="MD · PDF · PPTX · DOCX · XLSX · JPG · PNG · ZIP (최대 5개)">
                      첨부 {files.length > 0 ? `${files.length}/${MAX_FILES}` : ''}
                    </button>
                    <div className="seg">
                      {DEPTHS.map((d) => (
                        <button key={d.id} className={depth === d.id ? 'on' : ''} onClick={() => setDepth(d.id)} title={d.hint} disabled={running}>{d.label}</button>
                      ))}
                    </div>
                    {!running && !hasKey && (
                      <button className="ghost demo" onClick={() => start(true)}>키 없이 데모 보기</button>
                    )}
                    {running ? (
                      <button className="stop" onClick={() => live.runId && api.runs.cancel(live.runId)}>■ 중단</button>
                    ) : (
                      <button className="primary run" onClick={() => start()} disabled={!brief.trim()}>지시하기 ⌘↵</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <Inspector live={live} selected={selected} />
          </div>
        )}

        {view === 'report' && (live.record ? <Report run={live.record} onToast={showToast} /> : <div className="report empty"><p>왼쪽 기록에서 리포트를 선택하거나 새 업무를 지시하세요.</p></div>)}
        {view === 'brain' && <Brain onToast={showToast} />}
        {view === 'cost' && <CostView onOpenSettings={() => setView('settings')} />}
        {view === 'settings' && <SettingsView onToast={showToast} onKeyChange={setHasKey} update={update} />}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
