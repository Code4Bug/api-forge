import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const cliTag = process.argv.find((argument) => argument.startsWith('--tag='))?.slice('--tag='.length)
const cliRemote = process.argv.find((argument) => argument.startsWith('--remote='))?.slice('--remote='.length)
const tag = cliTag || process.env.npm_config_tag || `v${packageJson.version}`
const configuredRemote = cliRemote || process.env.RELEASE_REMOTE || process.env.npm_config_remote

const remotes = execFileSync('git', ['remote'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map((remote) => remote.trim())
  .filter(Boolean)
const remote = configuredRemote || ['origin', 'github'].find((name) => remotes.includes(name)) || remotes[0]

if (!remote) {
  throw new Error('未配置 Git 远端，请先执行 git remote add origin <仓库地址>。')
}

if (!remotes.includes(remote)) {
  throw new Error(`Git 远端 “${remote}” 不存在，当前可用远端：${remotes.join(', ') || '无'}。`)
}

try {
  execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}`], { stdio: 'ignore' })
} catch {
  execFileSync('git', ['tag', tag], { stdio: 'inherit' })
}

execFileSync('git', ['push', remote, tag], { stdio: 'inherit' })
