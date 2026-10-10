import type { LikeMinApi } from '@shared/types'

declare global {
  interface Window {
    api: LikeMinApi
  }
}

export const api = window.api
