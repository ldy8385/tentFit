import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devPresetPlugin } from './scripts/devPresetPlugin'
import { serviceWorkerPlugin } from './scripts/serviceWorker'

export default defineConfig({
  plugins: [react(), devPresetPlugin(import.meta.dirname), serviceWorkerPlugin()],
})
