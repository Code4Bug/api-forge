import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronBin = process.platform === 'win32'
  ? join(root, 'node_modules', '.bin', 'electron.cmd')
  : join(root, 'node_modules', '.bin', 'electron')

if (!existsSync(electronBin)) {
  console.error('未找到 Electron。请先在项目目录执行 pnpm install，然后再运行 npm run dev。')
  process.exit(1)
}
const child = spawn(electronBin, ['dist-electron/electron/main/index.js'], {
  cwd: root,
  env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5174' },
  stdio: 'inherit',
  shell: false,
})

child.on('close', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error('无法启动 Electron:', error.message)
  process.exit(1)
})
