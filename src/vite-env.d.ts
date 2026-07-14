/// <reference types="vite/client" />

import type { DesktopApi } from './shared/ipc-contracts'

declare global {
  interface Window {
    desktopApi?: DesktopApi
  }
}
