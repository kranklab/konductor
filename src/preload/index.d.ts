import type { KonductorAPI } from './index'

declare global {
  interface Window {
    konductorAPI: KonductorAPI
  }
}
