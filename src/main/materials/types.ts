/** MPM이 참고하는 자료 한 단위 */
export interface Material {
  /** 파일명, ZIP 내부 경로, 또는 URL */
  source: string
  kind: 'text' | 'pdf' | 'image'
  text?: string
  pdf?: string
  image?: { mediaType: string; data: string }
  /** 사람이 읽는 요약 정보 (예: PPTX 12장) */
  note?: string
}
