import { resolve } from 'path'
import { execSync } from 'child_process'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

function getAppVersion(): string {
  if (process.env.BUILD_VERSION) return process.env.BUILD_VERSION
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    return `${pkg.version}-dev+${hash}`
  } catch {
    return `${pkg.version}-dev`
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      rollupOptions: {
        external: ['node-pty']
      }
    },
    server: {
      watch: {
        ignored: ['**/.konductor/**']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    server: {
      watch: {
        ignored: ['**/.konductor/**']
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(getAppVersion())
    }
  }
})
