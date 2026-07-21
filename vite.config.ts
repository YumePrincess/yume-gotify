import { cloudflare } from '@cloudflare/vite-plugin'
import babel from '@rolldown/plugin-babel'
import clientTokenCleanupPlugin from '@gotify/client-token-cleanup'
import messageAutoDeletePlugin from '@gotify/message-auto-delete'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import generateLoadPlugin from './scripts/generate-load-plugin'

function decoratorPreset(options: Record<string, unknown>) {
  return {
    preset: () => ({
      plugins: [['@babel/plugin-proposal-decorators', options]]
    }),
    rolldown: {
      filter: {
        code: '@'
      }
    }
  }
}

export default defineConfig({
  plugins: [
    generateLoadPlugin([clientTokenCleanupPlugin, messageAutoDeletePlugin]),
    react(),
    babel({ presets: [decoratorPreset({ version: '2023-11' })] }),
    cloudflare()
  ],
  build: {
    chunkSizeWarningLimit: 1000
  }
})
