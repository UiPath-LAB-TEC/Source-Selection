import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { uipathCodedApps } from '@uipath/coded-apps-dev/vite'

export default defineConfig({
  base: './',
  plugins: [react(), uipathCodedApps()],
  resolve: {
    // One system: the Award app uses Source Selection's own sign-in, data access, persona and look (@ss), and the shared
    // terms, ratings and form pieces (@forms), from source. One copy of React and every library both trees import.
    alias: {
      '@forms': fileURLToPath(new URL('../ss-task-forms/src', import.meta.url)),
      '@ss': fileURLToPath(new URL('../ss-workspace/src', import.meta.url)),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom', 'react-router', 'next-themes', 'lucide-react', 'sonner', '@uipath/apollo-wind', '@uipath/uipath-typescript'],
  },
  server: { port: 5175, strictPort: true, fs: { allow: ['..'] } },
  optimizeDeps: { include: ['@uipath/uipath-typescript'] },
})
