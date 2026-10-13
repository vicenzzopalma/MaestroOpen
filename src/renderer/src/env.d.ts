/// <reference types="vite/client" />

import type { MaestriDesktopApi } from '../../shared/contracts'

declare global {
  interface Window {
    maestri: MaestriDesktopApi
  }
}

export {}
