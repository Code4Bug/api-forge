import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFetchBody, buildFetchHeaders, buildFetchUrl, buildHttpSendRequest } from '../src/shared/http-request.ts'

test('共享请求构造器会统一解析 form-urlencoded', () => {
  const payload = buildHttpSendRequest(
    {
      method: 'POST',
      url: 'https://api.example.com/login',
      params: [{ id: 'p1', key: 'page', value: '{{page}}', enabled: true }],
      headers: [{ id: 'h1', key: 'X-Token', value: '{{token}}', enabled: true }],
      bodyType: 'form-urlencoded',
      formFields: [
        { id: 'f1', key: 'username', value: '{{username}}', kind: 'text', enabled: true },
        { id: 'f2', key: 'password', value: 'secret', kind: 'text', enabled: true },
      ],
    },
    {
      page: '2',
      token: 'abc',
      username: 'alice',
    },
  )

  assert.equal(payload.url, 'https://api.example.com/login')
  assert.deepEqual(payload.params?.[0], {
    id: 'p1',
    key: 'page',
    value: '2',
    enabled: true,
  })
  assert.equal(payload.headers?.['X-Token'], 'abc')
  assert.equal(payload.bodyType, 'form-urlencoded')
  assert.equal(payload.body, 'username=alice&password=secret')
})

test('共享 URL 构造器会拼接 query 参数', () => {
  const url = buildFetchUrl({
    url: 'https://api.example.com/orders?from=app',
    params: [
      { id: 'p1', key: 'page', value: '2', enabled: true },
      { id: 'p2', key: 'size', value: '20', enabled: true },
    ],
  })

  assert.equal(url, 'https://api.example.com/orders?from=app&page=2&size=20')
})

test('共享请求构造器会保留 multipart 字段', async () => {
  const payload = buildHttpSendRequest(
    {
      method: 'POST',
      url: 'https://api.example.com/upload',
      bodyType: 'multipart',
      formFields: [
        { id: 'f1', key: 'title', value: 'demo', kind: 'text', enabled: true },
        { id: 'f2', key: 'file', value: '/tmp/report.pdf', kind: 'file', enabled: true },
      ],
    },
    {},
  )

  assert.equal(payload.bodyType, 'multipart')
  assert.equal(payload.body, undefined)
  assert.equal(payload.formFields?.length, 2)

  const body = await buildFetchBody(payload, async (path) => {
    assert.equal(path, '/tmp/report.pdf')
    return new Uint8Array([1, 2, 3])
  })
  assert.equal(body instanceof FormData, true)
  assert.deepEqual(Array.from(body.entries()).map(([key, value]) => [
    key,
    typeof value === 'string' ? value : value.name,
  ]), [
    ['title', 'demo'],
    ['file', 'report.pdf'],
  ])
})

test('multipart 文件字段会读取真实文件内容', async () => {
  let readCount = 0
  const body = await buildFetchBody(
    {
      method: 'POST',
      bodyType: 'multipart',
      formFields: [
        { id: 'f1', key: 'file', value: '@/Users/edward/Downloads/01_original.jpg', kind: 'file', enabled: true },
      ],
    },
    async () => {
      readCount += 1
      return new Uint8Array([137, 80, 78, 71])
    },
  )

  assert.equal(readCount, 1)
  assert.equal(body instanceof FormData, true)
})

test('multipart 发送时会剥离 Content-Type', () => {
  const headers = buildFetchHeaders({
    headers: {
      'Content-Type': 'multipart/form-data',
      Accept: '*/*',
    },
    bodyType: 'multipart',
  })

  assert.deepEqual(headers, {
    Accept: '*/*',
  })
})
