import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    // model .glb ukurannya puluhan MB — biarin di public/ dan disajikan apa adanya
    assetsInlineLimit: 0,
  },
})
