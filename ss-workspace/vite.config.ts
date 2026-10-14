import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { uipathCodedApps } from '@uipath/coded-apps-dev/vite'

export default defineConfig({
  base: './',
  plugins: [react(), uipathCodedApps()],
  resolve: {
    // The in-app task dialog renders ss-task-forms' own forms from source, so Action Center and the workspace
    // always show the same form. One copy of React and the UI libraries for both trees.
    alias: { '@forms': fileURLToPath(new URL('../ss-task-forms/src', import.meta.url)) },
    dedupe: ['react', 'react-dom', 'lucide-react', 'sonner', '@uipath/apollo-wind', '@uipath/uipath-typescript'],
  },
  // Evaluation plans live at the repo root, shared with the robots and agents.
  server: { port: 5173, strictPort: true, fs: { allow: ['..'] } },
  optimizeDeps: { include: ['@uipath/uipath-typescript'] },
})
