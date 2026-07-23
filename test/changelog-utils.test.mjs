import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchChangelogMarkdown,
  formatUpdateNotesInfo,
  getChangelogDownloadUrl,
  parseChangelogMarkdown,
  selectChangelogAsset,
} from '../src/shared/changelog-utils.js'

test('优先选择 CHANGELOG.md 资产的下载地址', () => {
  const release = {
    assets: [
      { name: 'app.exe', url: 'https://api.github.com/assets/1' },
      {
        name: 'CHANGELOG.md',
        url: 'https://api.github.com/assets/2',
        browser_download_url: 'https://github.com/owner/repo/releases/download/v1.0.0/CHANGELOG.md',
      },
    ],
  }

  assert.equal(
    selectChangelogAsset(release)?.name,
    'CHANGELOG.md',
  )
  assert.equal(
    getChangelogDownloadUrl(release),
    'https://github.com/owner/repo/releases/download/v1.0.0/CHANGELOG.md',
  )
})

test('没有下载地址时回退 API 地址', () => {
  const release = {
    assets: [
      {
        name: 'CHANGELOG.md',
        url: 'https://api.github.com/assets/2',
      },
    ],
  }

  assert.equal(
    getChangelogDownloadUrl(release),
    'https://api.github.com/assets/2',
  )
})

test('解析带链接的更新日志条目', () => {
  const parsed = parseChangelogMarkdown(`\n# CHANGELOG\n\n## v0.2.22\n\n生成范围：\`v0.2.21..v0.2.22\`\n\n- [a84e135](https://github.com/Code4Bug/api-forge/commit/a84e1356c0107aa3c336dd957851594e468adb3b) ci(github workflow): 新增打包更新日志并上传，优化更新日志加载逻辑\n`)

  assert.equal(parsed.range, 'v0.2.21..v0.2.22')
  assert.equal(parsed.notes.length, 1)
  assert.deepEqual(parsed.notes[0], {
    hash: 'a84e135',
    shortHash: 'a84e135',
    message: 'ci(github workflow): 新增打包更新日志并上传，优化更新日志加载逻辑',
    url: 'https://github.com/Code4Bug/api-forge/commit/a84e1356c0107aa3c336dd957851594e468adb3b',
  })
})

test('没有 section 时返回空结果', () => {
  const parsed = parseChangelogMarkdown('# CHANGELOG\n\n没有版本段')
  assert.equal(parsed.range, '')
  assert.deepEqual(parsed.notes, [])
})

test('将解析结果映射为应用更新日志字段', () => {
  const parsed = {
    range: 'v0.2.21..v0.2.22',
    notes: [
      {
        hash: 'a84e135',
        shortHash: 'a84e135',
        message: 'ci(github workflow): 新增打包更新日志并上传，优化更新日志加载逻辑',
      },
    ],
  }

  assert.deepEqual(formatUpdateNotesInfo(parsed, '自动联动 CHANGELOG.md'), {
    updateNotesRange: 'v0.2.21..v0.2.22',
    updateNotes: parsed.notes,
    updateNotesSource: '自动联动 CHANGELOG.md',
  })
})

test('按下载地址获取 CHANGELOG 内容', async () => {
  const calls = []
  const markdown = await fetchChangelogMarkdown(
    'https://example.com/CHANGELOG.md',
    async (url, options) => {
      calls.push({ url, options })
      return {
        ok: true,
        async text() {
          return '# CHANGELOG\n\n## v0.2.22\n\n生成范围：`v0.2.21..v0.2.22`\n\n- [a84e135](https://github.com/Code4Bug/api-forge/commit/a84e1356c0107aa3c336dd957851594e468adb3b) ci(github workflow): 新增打包更新日志并上传，优化更新日志加载逻辑\n'
        },
      }
    },
  )

  assert.equal(markdown.includes('v0.2.22'), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://example.com/CHANGELOG.md')
  assert.equal(calls[0].options.headers.Accept, 'application/octet-stream')
})

test('下载失败时返回空字符串', async () => {
  const markdown = await fetchChangelogMarkdown(
    'https://example.com/CHANGELOG.md',
    async () => ({ ok: false }),
  )
  assert.equal(markdown, '')
})
