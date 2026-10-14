import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devPresetPlugin } from './scripts/devPresetPlugin'

export default defineConfig({
  plugins: [react(), devPresetPlugin(import.meta.dirname)],
})
