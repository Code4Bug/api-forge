import { createHash, randomUUID } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'
import { createSocket } from 'node:dgram'
import { createServer as createTcpServer } from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOST = process.env.SIMULATOR_HOST ?? '127.0.0.1'
const HTTP_PORT = Number(process.env.SIMULATOR_HTTP_PORT ?? 8787)
const TCP_PORT = Number(process.env.SIMULATOR_TCP_PORT ?? 18080)
const UDP_PORT = Number(process.env.SIMULATOR_UDP_PORT ?? 18081)
const workspacePath = join(homedir(), '.api-forge', 'workspace.json')

const json = (response, status, payload) => {
  const body = JSON.stringify(payload)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'access-control-allow-origin': '*' })
  response.end(body)
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return { raw: Buffer.concat(chunks).toString('utf8') } }
}

function handleHttp(request, response) {
  const url = new URL(request.url, `http://${HOST}:${HTTP_PORT}`)
  if (request.method === 'OPTIONS') return json(response, 204, {})
  if (url.pathname === '/health') return json(response, 200, { ok: true, service: 'api-server-simulator', time: new Date().toISOString() })
  if (url.pathname === '/api/orders' && request.method === 'GET') return json(response, 200, { items: [{ id: 'order-1001', status: 'paid', amount: 128.42 }, { id: 'order-1002', status: 'pending', amount: 76.5 }], page: Number(url.searchParams.get('page') ?? 1), size: Number(url.searchParams.get('size') ?? 20) })
  if (url.pathname.startsWith('/api/orders/') && request.method === 'GET') return json(response, 200, { id: url.pathname.split('/').pop(), status: 'paid', amount: 128.42, customer: { id: 'user-1001', name: '模拟用户' } })
  if (url.pathname === '/api/orders' && request.method === 'POST') return readBody(request).then((body) => json(response, 201, { id: `order-${Date.now()}`, status: 'created', ...body }))
  if (url.pathname === '/api/users/me' && request.method === 'GET') return json(response, 200, { id: 'user-1001', name: '模拟用户', roles: ['tester'] })
  if (url.pathname === '/api/users/logout' && request.method === 'DELETE') return json(response, 200, { ok: true, message: '已注销（模拟）' })
  if (url.pathname === '/api/error') return json(response, 500, { code: 'SIMULATED_ERROR', message: '这是模拟服务返回的错误' })
  if (url.pathname === '/sse/events') {
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' })
    let index = 0
    const timer = setInterval(() => {
      index += 1
      response.write(`id: ${index}\nevent: message\ndata: ${JSON.stringify({ index, text: `模拟事件 ${index}`, timestamp: Date.now() })}\n\n`)
      if (index >= 6) { clearInterval(timer); response.write('event: done\ndata: [DONE]\n\n'); response.end() }
    }, 500)
    request.on('close', () => clearInterval(timer))
    return
  }
  json(response, 404, { code: 'NOT_FOUND', message: `未找到接口: ${request.method} ${url.pathname}` })
}

function encodeFrame(text) {
  const payload = Buffer.from(text)
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
  if (payload.length < 65536) { const header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2); return Buffer.concat([header, payload]) }
  const header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); return Buffer.concat([header, payload])
}

function startWebSocket(server) {
  server.on('upgrade', (request, socket) => {
    if (new URL(request.url, `http://${HOST}`).pathname !== '/ws/market') return socket.destroy()
    const key = request.headers['sec-websocket-key']
    if (!key) return socket.destroy()
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    socket.write(encodeFrame(JSON.stringify({ type: 'welcome', connectionId: randomUUID() })))
    const timer = setInterval(() => socket.write(encodeFrame(JSON.stringify({ type: 'price', symbol: 'API', value: Number((100 + Math.random() * 10).toFixed(2)), timestamp: Date.now() }))), 1000)
    let buffer = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 2) {
        const masked = Boolean(buffer[1] & 0x80); let length = buffer[1] & 0x7f; let offset = 2
        if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4 }
        if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10 }
        const maskOffset = masked ? 4 : 0
        if (buffer.length < offset + maskOffset + length) return
        const mask = masked ? buffer.subarray(offset, offset + 4) : undefined; offset += maskOffset
        const payload = Buffer.from(buffer.subarray(offset, offset + length)); buffer = buffer.subarray(offset + length)
        if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4]
        if ((buffer[0] ?? 0) === 0x88) { socket.end(); return }
        socket.write(encodeFrame(JSON.stringify({ type: 'echo', received: payload.toString('utf8'), timestamp: Date.now() })))
      }
    })
    socket.on('close', () => clearInterval(timer)); socket.on('error', () => clearInterval(timer))
  })
}

function startTcp() {
  const server = createTcpServer((socket) => {
    socket.setEncoding('utf8')
    socket.write('API Forge TCP simulator ready\n')
    socket.on('data', (data) => socket.write(JSON.stringify({ ok: true, protocol: 'tcp', echo: data.trim(), timestamp: Date.now() }) + '\n'))
  })
  server.listen(TCP_PORT, HOST, () => console.log(`[tcp] ${HOST}:${TCP_PORT}`))
}

function startUdp() {
  const socket = createSocket('udp4')
  socket.on('message', (message, remote) => socket.send(Buffer.from(JSON.stringify({ ok: true, protocol: 'udp', echo: message.toString(), timestamp: Date.now() })), remote.port, remote.address))
  socket.bind(UDP_PORT, HOST, () => console.log(`[udp] ${HOST}:${UDP_PORT}`))
}

function simulatorWorkspace() {
  const api = (id, name, protocol, method, folderId) => ({ id, type: 'api', name, protocol, method, parentId: folderId })
  return { version: 2, apiTree: [
    { id: 'folder-simulator-http', type: 'folder', name: '模拟 HTTP', children: [api('sim-health', '健康检查', 'http', 'GET', 'folder-simulator-http'), api('sim-orders', '订单列表', 'http', 'GET', 'folder-simulator-http'), api('sim-order-create', '创建订单', 'http', 'POST', 'folder-simulator-http'), api('sim-order-detail', '订单详情', 'http', 'GET', 'folder-simulator-http'), api('sim-error', '错误响应', 'http', 'GET', 'folder-simulator-http')] },
    { id: 'folder-simulator-stream', type: 'folder', name: '模拟流式服务', children: [api('sim-sse', 'SSE 事件流', 'sse', 'GET', 'folder-simulator-stream'), api('sim-websocket', '行情 WebSocket', 'websocket', undefined, 'folder-simulator-stream')] },
    { id: 'folder-simulator-socket', type: 'folder', name: '模拟 Socket', children: [api('sim-tcp', 'TCP 回显', 'socket', undefined, 'folder-simulator-socket'), api('sim-udp', 'UDP 回显', 'socket', undefined, 'folder-simulator-socket')] },
  ], environments: [{ id: 'simulator', name: 'Simulator', variables: [{ id: 'sim-base-url', key: 'base_url', value: `http://${HOST}:${HTTP_PORT}`, type: 'text', scope: 'environment' }, { id: 'sim-ws-url', key: 'ws_url', value: `ws://${HOST}:${HTTP_PORT}`, type: 'text', scope: 'environment' }], globalHeaders: [] }], requests: [
    { id: 'sim-health', protocol: 'http', name: '健康检查', method: 'GET', url: '{{base_url}}/health', params: [], headers: [], updatedAt: new Date().toISOString() },
    { id: 'sim-orders', protocol: 'http', name: '订单列表', method: 'GET', url: '{{base_url}}/api/orders', params: [{ id: 'page', key: 'page', value: '1', enabled: true }, { id: 'size', key: 'size', value: '20', enabled: true }], headers: [], updatedAt: new Date().toISOString() },
    { id: 'sim-order-create', protocol: 'http', name: '创建订单', method: 'POST', url: '{{base_url}}/api/orders', params: [], headers: [{ id: 'content-type', key: 'Content-Type', value: 'application/json', enabled: true }], body: '{\n  "sku": "demo",\n  "quantity": 1\n}', updatedAt: new Date().toISOString() },
    { id: 'sim-order-detail', protocol: 'http', name: '订单详情', method: 'GET', url: '{{base_url}}/api/orders/1001', params: [], headers: [], updatedAt: new Date().toISOString() },
    { id: 'sim-error', protocol: 'http', name: '错误响应', method: 'GET', url: '{{base_url}}/api/error', params: [], headers: [], updatedAt: new Date().toISOString() },
    { id: 'sim-sse', protocol: 'sse', name: 'SSE 事件流', method: 'GET', url: '{{base_url}}/sse/events', params: [], headers: [{ id: 'accept', key: 'Accept', value: 'text/event-stream', enabled: true }], updatedAt: new Date().toISOString() },
    { id: 'sim-websocket', protocol: 'websocket', name: '行情 WebSocket', url: '{{ws_url}}/ws/market', params: [], headers: [], updatedAt: new Date().toISOString() },
    { id: 'sim-tcp', protocol: 'socket', name: 'TCP 回显', url: `tcp://${HOST}:${TCP_PORT}`, params: [], headers: [], body: 'PING', updatedAt: new Date().toISOString() },
    { id: 'sim-udp', protocol: 'socket', name: 'UDP 回显', url: `udp://${HOST}:${UDP_PORT}`, params: [], headers: [], body: 'PING', updatedAt: new Date().toISOString() },
  ], history: [], preferences: { activeEnvironmentId: 'simulator', activeProtocol: 'http', openApiIds: [], theme: 'dark' } }
}

async function initWorkspace() {
  await mkdir(join(homedir(), '.api-forge'), { recursive: true })
  await writeFile(workspacePath, JSON.stringify(simulatorWorkspace(), null, 2), 'utf8')
  console.log(`[workspace] ${workspacePath}`)
}

const shouldStart = !process.argv.includes('--no-server')
if (process.argv.includes('--init-workspace')) await initWorkspace()
if (shouldStart) {
  const http = createHttpServer(handleHttp)
  startWebSocket(http)
  http.listen(HTTP_PORT, HOST, () => console.log(`[http+sse+ws] http://${HOST}:${HTTP_PORT}`))
  startTcp(); startUdp()
}
