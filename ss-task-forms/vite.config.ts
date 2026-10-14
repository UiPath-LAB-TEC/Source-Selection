import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // 5174: local preview harness (no OAuth needed; Action Center injects the session when deployed).
  server: { port: 5174, strictPort: true },
})
