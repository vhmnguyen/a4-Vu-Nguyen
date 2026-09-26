import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const target = `http://127.0.0.1:${process.env.PORT || env.PORT || 3000}`

  return {
    root: fileURLToPath(new URL('./client', import.meta.url)),
    envDir: projectRoot,
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '^/(auth(?:/|$)|data(?:[/?]|$)|add(?:[/?]|$)|update(?:[/?]|$)|delete(?:[/?]|$)|hp(?:[/?]|$))': target,
        '/css/bootstrap.min.css': target,
      },
    },
    build: {
      outDir: fileURLToPath(new URL('./dist', import.meta.url)),
      emptyOutDir: true,
    },
  }
})
