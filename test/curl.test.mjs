import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCurlCommand } from '../src/utils/curl.ts'

test('curl 命令会拼接 query、headers 和 JSON body', () => {
  const command = buildCurlCommand({
    id: 'api-1',
    protocol: 'http',
    name: '订单列表',
    method: 'POST',
    url: 'https://api.example.com/v1/orders?from=app',
    params: [
      { id: 'p1', key: 'page', value: '1', enabled: true },
      { id: 'p2', key: 'size', value: '20', enabled: true },
    ],
    headers: [
      { id: 'h1', key: 'Accept', value: 'application/json', enabled: true },
      { id: 'h2', key: 'X-Test', value: "O'Reilly", enabled: true },
    ],
    bodyType: 'json',
    body: '{"keyword":"book"}',
    formFields: [],
    updatedAt: new Date().toISOString(),
  })

  assert.equal(
    command,
    "curl -X POST 'https://api.example.com/v1/orders?from=app&page=1&size=20' \\\n" +
      "  -H 'Accept: application/json' \\\n" +
      "  -H 'X-Test: O'\\''Reilly' \\\n" +
      "  --data-raw '{\"keyword\":\"book\"}'",
  )
})

test('form-urlencoded 会按字段拼接 data-urlencode', () => {
  const command = buildCurlCommand({
    id: 'api-2',
    protocol: 'http',
    name: '登录',
    method: 'POST',
    url: 'https://api.example.com/login',
    params: [],
    headers: [
      {
        id: 'h1',
        key: 'Content-Type',
        value: 'application/x-www-form-urlencoded',
        enabled: true,
      },
    ],
    bodyType: 'form-urlencoded',
    body: '',
    formFields: [
      { id: 'f1', key: 'username', value: 'alice', kind: 'text', enabled: true },
      { id: 'f2', key: 'password', value: 'a b', kind: 'text', enabled: true },
    ],
    updatedAt: new Date().toISOString(),
  })

  assert.equal(
    command,
    "curl -X POST 'https://api.example.com/login' \\\n" +
      "  -H 'Content-Type: application/x-www-form-urlencoded' \\\n" +
      "  --data-urlencode 'username=alice' \\\n" +
      "  --data-urlencode 'password=a b'",
  )
})

test('multipart 会保留请求头并使用 -F', () => {
  const command = buildCurlCommand({
    id: 'api-3',
    protocol: 'http',
    name: '上传',
    method: 'POST',
    url: 'https://api.example.com/upload',
    params: [],
    headers: [
      {
        id: 'h1',
        key: 'Content-Type',
        value: 'multipart/form-data',
        enabled: true,
      },
    ],
    bodyType: 'multipart',
    body: '',
    formFields: [
      { id: 'f1', key: 'title', value: 'demo', kind: 'text', enabled: true },
      { id: 'f2', key: 'file', value: '', kind: 'file', enabled: true },
    ],
    updatedAt: new Date().toISOString(),
  })

  assert.equal(
    command,
    "curl -X POST 'https://api.example.com/upload' \\\n" +
      "  -H 'Content-Type: multipart/form-data' \\\n" +
      "  -F 'title=demo' \\\n" +
      "  -F 'file=@/path/to/file'",
  )
})
