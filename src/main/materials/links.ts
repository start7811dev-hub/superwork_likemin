/**
 * 링크 → 자료.
 * - GitHub 저장소: API로 저장소 정보 · README · 파일 구조 · 핵심 파일을 읽는다 (비공개는 GitHub 토큰)
 * - 그 밖의 페이지: 숨은 브라우저 창에서 실제로 렌더링해 텍스트와 화면을 가져온다.
 *   사용자가 앱 안 로그인 창에서 로그인해 두면 그 세션(쿠키)으로 연다. 읽기만 하고 조작하지 않는다.
 */
import { BrowserWindow, session } from 'electron'
import type { Material } from './types'
import { getSecret } from '../secrets'

export const LINK_PARTITION = 'persist:likemin-links'
export const MAX_LINKS = 5

export function extractUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s<>"'`)\]}]+/g) ?? []
  return [...new Set(urls.map((u) => u.replace(/[.,;:!?]+$/, '')))].slice(0, MAX_LINKS)
}

/* ---------- GitHub ---------- */
const KEY_FILES = ['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'docker-compose.yml', 'Dockerfile', 'tsconfig.json', '.env.example', 'CLAUDE.md', 'AGENTS.md']

function parseGithub(url: string): { owner: string; repo: string; ref?: string; path?: string } | null {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?/)
  if (!m) return null
  return { owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: m[3], path: m[4] }
}

async function gh<T>(path: string): Promise<T> {
  const token = getSecret('githubToken')
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SuperWorkLikeMin', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  })
  if (res.status === 404) throw new Error(token ? '저장소를 찾을 수 없습니다 (토큰 권한 확인)' : '저장소를 찾을 수 없습니다 — 비공개라면 설정에서 GitHub 토큰을 등록하세요')
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return res.json() as Promise<T>
}

async function ghFile(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const f = await gh<{ content?: string; encoding?: string; size: number }>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${ref}`)
    if (!f.content || f.size > 200_000) return null
    return Buffer.from(f.content, 'base64').toString('utf8')
  } catch {
    return null
  }
}

async function readGithub(url: string): Promise<Material[]> {
  const g = parseGithub(url)!
  const meta = await gh<{ full_name: string; description: string | null; default_branch: string; stargazers_count: number; language: string | null; topics?: string[]; pushed_at: string; private: boolean }>(`/repos/${g.owner}/${g.repo}`)
  const ref = g.ref ?? meta.default_branch
  const tree = await gh<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(`/repos/${g.owner}/${g.repo}/git/trees/${ref}?recursive=1`)
  const files = tree.tree.filter((t) => t.type === 'blob' && !/node_modules\/|\.git\/|dist\/|build\//.test(t.path)).map((t) => t.path)
  const scoped = g.path ? files.filter((p) => p.startsWith(g.path!)) : files
  const readmePath = scoped.find((p) => /(^|\/)readme\.md$/i.test(p) && (!g.path || p.split('/').length <= g.path.split('/').length + 1)) ?? files.find((p) => /^readme\.md$/i.test(p))
  const readme = readmePath ? await ghFile(g.owner, g.repo, readmePath, ref) : null
  const keys = files.filter((p) => KEY_FILES.includes(p.split('/').pop()!) && p.split('/').length <= 2).slice(0, 8)
  const keyContents = (await Promise.all(keys.map(async (p) => ({ p, c: await ghFile(g.owner, g.repo, p, ref) })))).filter((k) => k.c)

  const head = [
    `# GitHub 저장소 ${meta.full_name}${meta.private ? ' (비공개)' : ''}`,
    meta.description ? `설명: ${meta.description}` : '',
    `주 언어: ${meta.language ?? '-'} · 스타 ${meta.stargazers_count} · 기본 브랜치 ${meta.default_branch} · 최근 푸시 ${meta.pushed_at.slice(0, 10)}`,
    meta.topics?.length ? `토픽: ${meta.topics.join(', ')}` : '',
    `\n## 파일 구조 (${scoped.length}개${tree.truncated ? ', 일부 생략' : ''})\n${scoped.slice(0, 500).join('\n')}`
  ].filter(Boolean)
  const out: Material[] = [{ source: url, kind: 'text', text: head.join('\n'), note: `GitHub · 파일 ${scoped.length}개` }]
  if (readme) out.push({ source: `${meta.full_name}/${readmePath}`, kind: 'text', text: readme.slice(0, 40_000) })
  for (const k of keyContents) out.push({ source: `${meta.full_name}/${k.p}`, kind: 'text', text: k.c!.slice(0, 20_000) })
  return out
}

/* ---------- 일반 웹 페이지 (렌더링) ---------- */
async function readPage(url: string): Promise<Material[]> {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { partition: LINK_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true }
  })
  try {
    await Promise.race([win.loadURL(url), new Promise((_, rej) => setTimeout(() => rej(new Error('페이지 로딩 시간 초과')), 30_000))])
    await new Promise((r) => setTimeout(r, 2500)) // JS 렌더링 대기
    const page = (await win.webContents.executeJavaScript(
      `({ title: document.title, url: location.href, text: (document.querySelector('main, article') || document.body).innerText.slice(0, 40000) })`
    )) as { title: string; url: string; text: string }
    const shot = await win.webContents.capturePage()
    const loginWall = /log ?in|sign ?in|로그인/i.test(page.title) && page.text.length < 3000
    const out: Material[] = [
      {
        source: url,
        kind: 'text',
        text: `# ${page.title}\n(최종 주소: ${page.url})${loginWall ? '\n⚠ 로그인 화면으로 보입니다 — 앱의 "로그인" 버튼으로 먼저 로그인하세요.' : ''}\n\n${page.text}`,
        note: loginWall ? '로그인 필요로 보임' : `페이지 ${page.text.length.toLocaleString()}자`
      }
    ]
    if (!shot.isEmpty()) out.push({ source: `${url} (화면)`, kind: 'image', image: { mediaType: 'image/jpeg', data: shot.resize({ width: 1280 }).toJPEG(80).toString('base64') } })
    return out
  } finally {
    win.destroy()
  }
}

export async function readLink(url: string): Promise<Material[]> {
  return parseGithub(url) ? readGithub(url) : readPage(url)
}

/** 로그인이 필요한 사이트: 사용자가 직접 로그인하는 창. 닫으면 세션이 저장된다. */
export function openLoginWindow(url: string, parent?: BrowserWindow | null): Promise<void> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 1100,
      height: 820,
      parent: parent ?? undefined,
      title: '로그인 후 이 창을 닫으세요 — SUPER WORK · LIKE MIN',
      webPreferences: { partition: LINK_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    win.on('page-title-updated', (e) => e.preventDefault())
    void win.loadURL(url)
    win.on('closed', () => resolve())
  })
}

export async function clearLinkSessions(): Promise<void> {
  await session.fromPartition(LINK_PARTITION).clearStorageData()
}
