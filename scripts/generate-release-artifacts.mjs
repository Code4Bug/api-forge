import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const releaseJsonPath = join(projectRoot, 'release.json')
const changelogPath = join(projectRoot, 'CHANGELOG.md')

function normalizeGitRemoteUrl(remoteUrl) {
  if (remoteUrl.startsWith('git@')) {
    const match = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
    if (!match) return undefined
    return `https://${match[1]}/${match[2].replace(/\.git$/, '')}`
  }
  if (remoteUrl.startsWith('https://') || remoteUrl.startsWith('http://')) {
    return remoteUrl.replace(/\.git$/, '')
  }
  return undefined
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
    return remoteUrl ? normalizeGitRemoteUrl(remoteUrl) : undefined
  } catch {
    return undefined
  }
}

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

function buildReleaseArtifacts() {
  const versionTag = `v${packageJson.version}`
  const tags = getTags()
  const currentTag = tags.includes(versionTag) ? versionTag : tags.at(-1) ?? versionTag
  const previousTag = tags.indexOf(currentTag) > 0 ? tags[tags.indexOf(currentTag) - 1] : undefined
  const range = previousTag ? `${previousTag}..${currentTag}` : currentTag
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

  return {
    version: packageJson.version,
    tag: currentTag,
    range,
    generatedAt: new Date().toISOString(),
    notes,
  }
}

function buildChangelog(release) {
  const lines = [
    '# CHANGELOG',
    '',
    `## ${release.tag}`,
    '',
    `生成范围：\`${release.range}\``,
    '',
  ]
  if (release.notes.length === 0) {
    lines.push('- 暂无可用提交')
  } else {
    for (const note of release.notes) {
      lines.push(`- ${note.shortHash} ${note.message}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

const release = buildReleaseArtifacts()
mkdirSync(projectRoot, { recursive: true })
writeFileSync(releaseJsonPath, `${JSON.stringify(release, null, 2)}\n`, 'utf8')
writeFileSync(changelogPath, buildChangelog(release), 'utf8')
