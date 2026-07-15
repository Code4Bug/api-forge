import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  // Electron 生产环境通过 file:// 加载页面，资源必须使用相对路径。
  base: './',
  server: {
    host: 'localhost',
    port: Number(process.env.VITE_PORT ?? 5174),
    strictPort: true,
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
})
