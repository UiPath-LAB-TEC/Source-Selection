import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    // The Award forms run on Source Selection's task host, backend, terms and form pieces (@forms), from source, so
    // every action app in the system opens, loads and completes a task the same way.
    alias: { '@forms': fileURLToPath(new URL('../ss-task-forms/src', import.meta.url)) },
    dedupe: ['react', 'react-dom', 'lucide-react', 'sonner', '@uipath/apollo-wind', '@uipath/uipath-typescript', '@uipath/coded-action-app'],
  },
  // 5176: local preview harness (no OAuth needed; Action Center injects the session when deployed).
  server: { port: 5176, strictPort: true, fs: { allow: ['..'] } },
})
