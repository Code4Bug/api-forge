import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCurlCommand, parseCurlCommand } from '../src/utils/curl.ts'

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

test('multipart 文件字段带 @ 时不会重复拼接', () => {
  const command = buildCurlCommand({
    id: 'api-3b',
    protocol: 'http',
    name: '上传',
    method: 'POST',
    url: 'https://api.example.com/upload',
    params: [],
    headers: [
      {
        id: 'h1',
        key: 'Accept',
        value: '*/*',
        enabled: true,
      },
      {
        id: 'h2',
        key: 'x-access-token',
        value: '{{token}}',
        enabled: true,
      },
    ],
    bodyType: 'multipart',
    body: '',
    formFields: [
      { id: 'f1', key: 'file', value: '@/Users/edward/Downloads/01_original.jpg', kind: 'file', enabled: true },
    ],
    updatedAt: new Date().toISOString(),
  })

  assert.equal(
    command,
    "curl -X POST 'https://api.example.com/upload' \\\n" +
      "  -H 'Accept: */*' \\\n" +
      "  -H 'x-access-token: {{token}}' \\\n" +
      "  -F 'file=@/Users/edward/Downloads/01_original.jpg'",
  )
})

test('导入 multipart curl 会还原表单字段', () => {
  const parsed = parseCurlCommand(
    "curl -X POST 'https://api.example.com/upload' \\\n" +
      "  -H 'Content-Type: multipart/form-data' \\\n" +
      "  -F 'title=demo' \\\n" +
      "  -F 'file=@/path/to/file'",
  )

  assert.equal(parsed?.bodyType, 'multipart')
  assert.equal(parsed?.formFields?.length, 2)
  assert.deepEqual(parsed?.formFields?.[1], {
    id: 'curl-form-1',
    key: 'file',
    value: '/path/to/file',
    kind: 'file',
    enabled: true,
  })
})

test('导入 data-urlencode curl 会还原为 form-urlencoded', () => {
  const parsed = parseCurlCommand(
    "curl -X POST 'https://api.example.com/login' \\\n" +
      "  --data-urlencode 'username=alice' \\\n" +
      "  --data-urlencode 'password=a b'",
  )

  assert.equal(parsed?.bodyType, 'form-urlencoded')
  assert.equal(parsed?.formFields?.length, 2)
  assert.deepEqual(parsed?.formFields?.[0], {
    id: 'curl-form-0',
    key: 'username',
    value: 'alice',
    kind: 'text',
    enabled: true,
  })
})

test('导入 GET + data-urlencode curl 会还原为 params', () => {
  const parsed = parseCurlCommand(
    "curl -G 'https://api.example.com/search' \\\n" +
      "  --data-urlencode 'keyword=book' \\\n" +
      "  --data-urlencode 'page=2'",
  )

  assert.equal(parsed?.method, 'GET')
  assert.equal(parsed?.bodyType, undefined)
  assert.equal(parsed?.params?.length, 2)
  assert.deepEqual(parsed?.params?.[0], {
    id: 'curl-param-0-0',
    key: 'keyword',
    value: 'book',
    enabled: true,
  })
})

test('空 data 不会把导入的 GET 变成 POST', () => {
  const parsed = parseCurlCommand(
    "curl --location 'http://223.113.162.210:9999/idg/idgCase/analysis?court=%E6%B1%9F%E8%8B%8F%E7%9C%81%E5%8D%97%E9%80%9A%E5%B8%82%E5%8F%B8%E6%B3%95%E5%B1%80&applicantType=%E5%85%A8%E9%83%A8&respondentOrgType=%E5%85%A8%E9%83%A8&startDate=2026-01&endDate=2026-07&trialType=32' \\\n" +
      "--header 'x-access-token: token' \\\n" +
      "--data ''",
  )

  assert.equal(parsed?.method, 'GET')
  assert.equal(parsed?.bodyType, undefined)
  assert.equal(parsed?.params?.length, 6)
})
