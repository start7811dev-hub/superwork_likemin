import { useEffect, useState } from 'react'
import type { IntegrationInfo, Settings, UpdateStatus } from '@shared/types'
import { api } from '../api'

const MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']

export default function SettingsView({ onToast, onKeyChange, update }: { onToast(m: string): void; onKeyChange(has: boolean): void; update: UpdateStatus }) {
  const [s, setS] = useState<Settings | null>(null)
  const [keySource, setKeySource] = useState<'stored' | 'env' | 'none'>('none')
  const [key, setKey] = useState('')
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([])
  const [version, setVersion] = useState('')
  const [adminKey, setAdminKey] = useState('')
  const [ghToken, setGhToken] = useState('')
  const [hasGh, setHasGh] = useState(false)
  const [mcpDraft, setMcpDraft] = useState({ name: '', url: '', token: '' })
  const [hasAdmin, setHasAdmin] = useState(false)

  useEffect(() => {
    void api.settings.get().then((r) => {
      setS(r.settings)
      setKeySource(r.keySource)
    })
    void api.integrations.list().then(setIntegrations)
    void api.app.version().then(setVersion)
    void api.cost.hasAdminKey().then(setHasAdmin)
    void api.secrets.has('githubToken').then(setHasGh)
  }, [])
  if (!s) return null

  const save = async (next: Settings) => {
    setS(next)
    await api.settings.save(next)
  }
  const saveKey = async () => {
    const r = await api.settings.setKey(key)
    onToast(r.message)
    if (r.ok) {
      setKey('')
      setKeySource('stored')
      onKeyChange(true)
    }
  }
  const setField = (id: string, k: string, v: string) =>
    save({ ...s, integrations: { ...s.integrations, [id]: { ...(s.integrations[id] ?? {}), [k]: v } } })

  return (
    <div className="settings">
      <section className="card-sec">
        <h3>Claude API</h3>
        <p className="muted small">
          {keySource === 'stored' ? '✓ 키가 OS 보안 저장소에 암호화되어 저장되어 있습니다.' : keySource === 'env' ? '✓ ANTHROPIC_API_KEY 환경변수를 사용 중입니다.' : '키가 없습니다. console.anthropic.com에서 발급하세요.'}
        </p>
        <div className="row">
          <input type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="primary" onClick={saveKey} disabled={!key}>검증 후 저장</button>
          {keySource === 'stored' && <button className="ghost" onClick={async () => { await api.settings.clearKey(); setKeySource('none'); onKeyChange(false) }}>삭제</button>}
        </div>
      </section>

      <section className="card-sec">
        <h3>API 비용 · 예산</h3>
        <p className="muted small">
          Claude API는 선불 잔액을 조회하는 기능을 제공하지 않습니다. 그래서 <b>잔여 = 예산 − 소진</b>으로 계산합니다.
          Admin API 키(sk-ant-admin…)를 등록하면 소진을 Cost API의 <b>조직 실측 비용</b>으로, 없으면 이 앱의 호출 기록으로 추정합니다.
        </p>
        <label className="field">
          <span>예산 방식</span>
          <select value={s.budget.mode} onChange={(e) => save({ ...s, budget: { ...s.budget, mode: e.target.value as Settings['budget']['mode'] } })}>
            <option value="monthly">월 예산 (매월 1일 리셋)</option>
            <option value="credit">충전 잔액 (확인한 날짜부터 차감)</option>
          </select>
        </label>
        <label className="field">
          <span>{s.budget.mode === 'monthly' ? '월 예산 (USD)' : '확인한 잔액 (USD)'}</span>
          <input type="number" min={0} step={1} value={s.budget.amount || ''} placeholder="예: 100" onChange={(e) => save({ ...s, budget: { ...s.budget, amount: Number(e.target.value) || 0 } })} />
        </label>
        {s.budget.mode === 'credit' && (
          <label className="field">
            <span>잔액 확인 날짜</span>
            <input type="date" value={s.budget.since} onChange={(e) => save({ ...s, budget: { ...s.budget, since: e.target.value } })} />
            <span className="muted small">Console의 Billing에서 잔액을 확인한 날</span>
          </label>
        )}
        <div className="row">
          <input type="password" placeholder={hasAdmin ? 'Admin 키 등록됨 — 바꾸려면 새 키 입력' : 'Admin API 키 (선택) sk-ant-admin…'} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
          <button className="ghost" disabled={!adminKey} onClick={async () => { const r = await api.cost.setAdminKey(adminKey); onToast(r.message); if (r.ok) { setAdminKey(''); setHasAdmin(true) } }}>검증 후 저장</button>
          {hasAdmin && <button className="ghost" onClick={async () => { await api.cost.setAdminKey(null); setHasAdmin(false) }}>삭제</button>}
        </div>
      </section>

      <section className="card-sec">
        <h3>모델 배치 (기본값)</h3>
        <p className="muted small">MPM 위임 권한이 켜져 있으면 이 값은 기본값이고, MPM이 판단해 업무별로 바꿉니다. MPM(맥락 설계·검수·종합)은 가장 깊이 생각하는 모델, 하위 담당은 빠른 모델, 경량 작업은 가장 저렴한 모델에 배치합니다.</p>
        {(['mpm', 'worker', 'light'] as const).map((tier) => (
          <label key={tier} className="field">
            <span>{tier === 'mpm' ? 'MPM' : tier === 'worker' ? '하위 담당' : '경량 작업'}</span>
            <select value={s.models[tier]} onChange={(e) => save({ ...s, models: { ...s.models, [tier]: e.target.value } })}>
              {MODELS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        ))}
      </section>

      <section className="card-sec">
        <h3>공정</h3>
        <label className="field">
          <span>공정 규모</span>
          <select value={s.processMode} onChange={(e) => save({ ...s, processMode: e.target.value as Settings['processMode'] })}>
            <option value="adaptive">MPM이 과제마다 판단 (권장)</option>
            <option value="full">항상 전체 공정</option>
          </select>
        </label>
        <label className="field">
          <span>재작업 최대 횟수</span>
          <select value={s.maxRework} onChange={(e) => save({ ...s, maxRework: Number(e.target.value) })}>
            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}회</option>)}
          </select>
        </label>
        <label className="field">
          <span>동시 작업 수</span>
          <select value={s.maxParallel} onChange={(e) => save({ ...s, maxParallel: Number(e.target.value) })}>
            {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="field">
          <span>의도 질문</span>
          <select value={s.askMode} onChange={(e) => save({ ...s, askMode: e.target.value as Settings['askMode'] })}>
            <option value="critical">의도가 정말 불분명할 때만 (비유로)</option>
            <option value="always">질문 후보가 있으면 항상</option>
            <option value="never">묻지 않고 가정으로 진행</option>
          </select>
        </label>
        <label className="field">
          <span>브리프 승인</span>
          <input type="checkbox" checked={s.briefApproval} onChange={(e) => save({ ...s, briefApproval: e.target.checked })} />
          <span className="muted small">결과물을 만들기 전에 1장 브리프를 보여 주고 승인을 받습니다. 끄면 클론 심사만 거치고 바로 제작합니다</span>
        </label>
        <label className="field">
          <span>Factbook 웹 조사</span>
          <input type="checkbox" checked={s.webResearch} onChange={(e) => save({ ...s, webResearch: e.target.checked })} />
          <span className="muted small">모든 하위 담당이 실제 웹 검색으로 신뢰 자료를 수집 (끄면 모델 지식으로 작성 · 신뢰도 보수적)</span>
        </label>
        <label className="field">
          <span>MPM 위임 권한</span>
          <input type="checkbox" checked={s.delegation} onChange={(e) => save({ ...s, delegation: e.target.checked })} />
          <span className="muted small">켜면 MPM이 업무 난이도를 판단해 위 모델 배치를 무시하고 직접 모델을 골라 위임</span>
        </label>
        <label className="field">
          <span>출력 언어</span>
          <select value={s.language} onChange={(e) => save({ ...s, language: e.target.value as Settings['language'] })}>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
      </section>

      <section className="card-sec">
        <h3>참고 자료 · 링크</h3>
        <p className="muted small">업무 지시에 넣은 링크는 MPM이 열어서 분석합니다. GitHub 주소는 저장소 정보·README·파일 구조·핵심 파일을 읽고, 그 밖의 페이지는 앱 안 브라우저로 렌더링해 텍스트와 화면을 봅니다.</p>
        <div className="row">
          <input type="password" placeholder={hasGh ? 'GitHub 토큰 등록됨 — 바꾸려면 새 토큰 입력' : 'GitHub 토큰 (선택, 비공개 저장소용) ghp_… / github_pat_…'} value={ghToken} onChange={(e) => setGhToken(e.target.value)} />
          <button className="ghost" disabled={!ghToken} onClick={async () => { await api.secrets.set('githubToken', ghToken.trim()); setGhToken(''); setHasGh(true); onToast('GitHub 토큰을 저장했습니다.') }}>저장</button>
          {hasGh && <button className="ghost" onClick={async () => { await api.secrets.set('githubToken', null); setHasGh(false) }}>삭제</button>}
        </div>
        <div className="row">
          <span className="muted small" style={{ flex: 1 }}>로그인이 필요한 페이지는 업무 지시창의 링크 옆 <b>로그인</b> 버튼으로 먼저 로그인하세요. 세션은 이 앱 안에만 저장되고, MPM은 읽기만 합니다.</span>
          <button className="ghost" onClick={async () => { await api.links.clearSessions(); onToast('저장된 로그인 세션을 지웠습니다.') }}>로그인 세션 지우기</button>
        </div>
      </section>

      <section className="card-sec">
        <h3>MCP 서버</h3>
        <p className="muted small">원격 MCP 서버(Notion · Linear · 사내 도구 등)를 등록하면, Factbook 조사 단계에서 하위 담당이 그 도구로 자료를 찾습니다. URL은 MCP 서버의 원격 엔드포인트(https)여야 하며, 토큰은 OS 보안 저장소에 암호화됩니다.</p>
        {s.mcpServers.map((m, i) => (
          <div key={m.name} className="integ">
            <div className="row" style={{ marginTop: 0 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={m.enabled} onChange={(e) => save({ ...s, mcpServers: s.mcpServers.map((x, k) => (k === i ? { ...x, enabled: e.target.checked } : x)) })} />
                <b>{m.name}</b>
              </label>
              <span className="muted small" style={{ flex: 1 }}>{m.url}</span>
              <button className="link" onClick={async () => { await api.secrets.set(`mcp:${m.name}`, null); save({ ...s, mcpServers: s.mcpServers.filter((_, k) => k !== i) }) }}>삭제</button>
            </div>
          </div>
        ))}
        <div className="row">
          <input placeholder="이름 (예: notion)" value={mcpDraft.name} onChange={(e) => setMcpDraft({ ...mcpDraft, name: e.target.value })} style={{ maxWidth: 160 }} />
          <input placeholder="https://… MCP 서버 URL" value={mcpDraft.url} onChange={(e) => setMcpDraft({ ...mcpDraft, url: e.target.value })} />
          <input type="password" placeholder="토큰 (선택)" value={mcpDraft.token} onChange={(e) => setMcpDraft({ ...mcpDraft, token: e.target.value })} style={{ maxWidth: 200 }} />
          <button
            className="ghost"
            disabled={!/^[\w .-]{1,60}$/.test(mcpDraft.name.trim()) || !/^https:\/\//.test(mcpDraft.url.trim()) || s.mcpServers.some((m) => m.name === mcpDraft.name.trim())}
            onClick={async () => {
              const name = mcpDraft.name.trim()
              if (mcpDraft.token.trim()) await api.secrets.set(`mcp:${name}`, mcpDraft.token.trim())
              await save({ ...s, mcpServers: [...s.mcpServers, { name, url: mcpDraft.url.trim(), enabled: true }] })
              setMcpDraft({ name: '', url: '', token: '' })
              onToast(`MCP 서버 "${name}"을 추가했습니다.`)
            }}
          >
            추가
          </button>
        </div>
      </section>

      <section className="card-sec">
        <h3>업무 툴 연동</h3>
        <p className="muted small">리포트 화면의 ‘공유’ 버튼으로 전송됩니다. JSON 플러그인을 폴더에 넣으면 새 연동이 추가됩니다.</p>
        {integrations.map((i) => (
          <div key={i.id} className="integ">
            <div><b>{i.name}</b> <span className="tag">{i.source === 'plugin' ? '플러그인' : '내장'}</span> <span className="muted small">{i.description}</span></div>
            {i.fields.map((f) => (
              <input
                key={f.key}
                type={f.secret ? 'password' : 'text'}
                placeholder={`${f.label}${f.placeholder ? ` — ${f.placeholder}` : ''}`}
                value={s.integrations[i.id]?.[f.key] ?? ''}
                onChange={(e) => setField(i.id, f.key, e.target.value)}
              />
            ))}
          </div>
        ))}
        <button className="ghost" onClick={() => api.integrations.openPluginFolder()}>플러그인 폴더 열기</button>
      </section>

      <section className="card-sec">
        <h3>업데이트</h3>
        <p className="muted small">
          현재 버전 v{version} ·{' '}
          {{ idle: '자동 확인 대기', checking: '확인 중…', available: `v${update.version} 다운로드 중`, none: '최신 버전입니다', downloading: `다운로드 ${Math.round(update.progress ?? 0)}%`, ready: `v${update.version} 설치 준비 완료`, error: `오류: ${update.message}`, dev: update.message }[update.state]}
        </p>
        <div className="row">
          <button className="ghost" onClick={() => api.updater.check()}>업데이트 확인</button>
          {update.state === 'ready' && <button className="primary" onClick={() => api.updater.install()}>재시작하여 설치</button>}
        </div>
      </section>
    </div>
  )
}
