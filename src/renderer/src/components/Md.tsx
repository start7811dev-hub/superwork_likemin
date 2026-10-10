import { marked } from 'marked'

/**
 * 모델이 쓴 마크다운을 안전하게 렌더링한다.
 * HTML 태그는 먼저 이스케이프해 텍스트로만 보이게 하고, 마크다운 문법만 해석한다.
 */
export default function Md({ text, inline = false }: { text: string; inline?: boolean }) {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>(?=[^\s])/g, '&gt;')
  const html = (inline ? marked.parseInline(safe, { async: false }) : marked.parse(safe, { async: false, breaks: true })) as string
  return inline ? <span className="md" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
