import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const changelogPath = join(projectRoot, 'CHANGELOG.md')

function getTags() {
  try {
    return execFileSync('git', ['tag', '--sort=creatordate'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((tag) => tag.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function getRemoteUrl() {
  try {
    const remotes = execFileSync('git', ['remote', '-v'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const remoteLine = remotes.find((line) => /\(fetch\)$/.test(line))
    const remoteUrl = remoteLine?.split(/\s+/)[1]
    if (!remoteUrl) return undefined
    if (remoteUrl.startsWith('git@')) {
      const match = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
      return match ? `https://${match[1]}/${match[2].replace(/\.git$/, '')}` : undefined
    }
    return remoteUrl.replace(/\.git$/, '')
  } catch {
    return undefined
  }
}

function resolveRange() {
  const versionTag = `v${packageJson.version}`
  const tags = getTags()
  const currentTag = tags.includes(versionTag) ? versionTag : tags.at(-1) ?? versionTag
  const currentIndex = tags.indexOf(currentTag)
  const previousTag = currentIndex > 0 ? tags[currentIndex - 1] : undefined
  return {
    currentTag,
    range: previousTag ? `${previousTag}..${currentTag}` : currentTag,
  }
}

function buildChangelog() {
  const { currentTag, range } = resolveRange()
  const remoteUrl = getRemoteUrl()
  let notes = []

  try {
    const rawLog = execFileSync('git', ['log', '--pretty=format:%H%x09%s', range], { encoding: 'utf8' }).trim()
    notes = rawLog
      ? rawLog
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [hash, ...messageParts] = line.split('\t')
            const message = messageParts.join('\t').trim()
            return {
              hash,
              shortHash: hash.slice(0, 7),
              message,
              url: remoteUrl ? `${remoteUrl}/commit/${hash}` : undefined,
            }
          })
          .filter((item) => item.hash && item.message)
      : []
  } catch {
    notes = []
  }

  const lines = [
    '# CHANGELOG',
    '',
    `## ${currentTag}`,
    '',
    `生成范围：\`${range}\``,
    '',
  ]

  if (notes.length > 0) {
    for (const note of notes) {
      if (note.url) {
        lines.push(`- [${note.shortHash}](${note.url}) ${note.message}`)
      } else {
        lines.push(`- ${note.shortHash} ${note.message}`)
      }
    }
  } else {
    lines.push('- 暂无可用提交')
  }

  lines.push('')
  writeFileSync(changelogPath, lines.join('\n'), 'utf8')
}

buildChangelog()
