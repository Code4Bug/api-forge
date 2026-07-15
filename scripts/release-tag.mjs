import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const cliTag = process.argv.find((argument) => argument.startsWith('--tag='))?.slice('--tag='.length)
const tag = cliTag || process.env.npm_config_tag || `v${packageJson.version}`

try {
  execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}`], { stdio: 'ignore' })
} catch {
  execFileSync('git', ['tag', tag], { stdio: 'inherit' })
}

execFileSync('git', ['push', 'github', tag], { stdio: 'inherit' })
