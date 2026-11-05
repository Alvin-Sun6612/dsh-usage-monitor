/**
 * dsh-usage-monitor —— 插件 Host 半。
 *
 * 职责：
 *   1. 读取本机会话日志（~/.dsh/sessions/**\/session.v4.jsonl.zstd），把每次模型调用的
 *      token 用量按本地日期聚合（今日 / 近 7 天 / 近 30 天 / 累计）。
 *   2. 需要余额时请求 DeepSeek 官方 /user/balance 接口（只在配置了 API Key 时）。
 *   3. 在 127.0.0.1 上起一个只读的小 HTTP 服务，供浏览器半（client.js）拉取数据。
 *
 * 只用 Node 内置模块，不 import 任何 @deepseek-ai/* 包（DSH 的插件 profile 里没有这些包）。
 * 不向任何第三方发送数据：会话日志只在本机解析，API Key 只会发往配置的 DeepSeek 接口。
 */
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

export const name = 'usage-monitor'
export const inject = []

const DEFAULT_PORT = 46850
const BIND_HOST = '127.0.0.1'
const ZSTD_MAGIC = 0xfd2fb528
const DAY_MS = 24 * 60 * 60 * 1000
const BALANCE_TTL_MS = 60 * 1000
const CONFIG_NAME = 'dsh-usage-monitor.json'

/** ~/.dsh（桌面版会注入 DSH_HOME）。 */
function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function configPath() {
  return path.join(dshHome(), CONFIG_NAME)
}

/* ------------------------------------------------------------------ *
 * zstd：DSH 的会话日志是「多个 zstd frame 首尾相连」的，
 * Node 的 zstdDecompressSync / createZstdDecompress 只解第一帧，
 * 所以这里自己遍历 frame 头，逐帧解压。
 * ------------------------------------------------------------------ */
function splitZstdFrames(buf) {
  const frames = []
  let p = 0
  while (p + 4 <= buf.length) {
    if (buf.readUInt32LE(p) !== ZSTD_MAGIC) break
    const start = p
    p += 4
    const fhd = buf[p++]
    const fcsFlag = fhd >> 6
    const singleSegment = (fhd >> 5) & 1
    const hasChecksum = (fhd >> 2) & 1
    const dictFlag = fhd & 3
    if (!singleSegment) p += 1 // window descriptor
    if (dictFlag === 3) p += 4
    else p += dictFlag
    let fcsSize = [0, 2, 4, 8][fcsFlag]
    if (singleSegment && fcsSize === 0) fcsSize = 1
    p += fcsSize
    for (;;) {
      if (p + 3 > buf.length) throw new Error('truncated zstd block header')
      const bh = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16)
      p += 3
      const last = bh & 1
      const type = (bh >> 1) & 3
      const size = bh >> 3
      if (type === 0) p += size
      else if (type === 1) p += 1
      else if (type === 2) p += size
      else throw new Error('reserved zstd block type')
      if (last) break
    }
    if (hasChecksum) p += 4
    if (p > buf.length) throw new Error('truncated zstd frame')
    frames.push(buf.subarray(start, p))
  }
  return frames
}

/** 解压一个会话文件，返回其中的事件对象数组（解析失败的行直接跳过）。 */
function readSessionEvents(buf) {
  const events = []
  for (const frame of splitZstdFrames(buf)) {
    let text
    try {
      text = zlib.zstdDecompressSync(frame).toString('utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line || line.indexOf('assistant/message') === -1) continue
      try {
        const event = JSON.parse(line)
        if (event && event.type === 'assistant/message') events.push(event)
      } catch {
        /* 半行/损坏行忽略 */
      }
    }
  }
  return events
}

function localDateKey(ms) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* ------------------------------------------------------------------ *
 * 用量扫描
 * ------------------------------------------------------------------ */
const fileCache = new Map() // filePath -> { mtimeMs, size, calls: [{ time, ... }] }

async function listSessionFiles(root) {
  const out = []
  let workspaceDirs = []
  try {
    workspaceDirs = await fsp.readdir(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ws of workspaceDirs) {
    if (!ws.isDirectory()) continue
    const wsPath = path.join(root, ws.name)
    let sessions = []
    try {
      sessions = await fsp.readdir(wsPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const s of sessions) {
      if (!s.isDirectory()) continue
      const dir = path.join(wsPath, s.name)
      let files = []
      try {
        files = await fsp.readdir(dir)
      } catch {
        continue
      }
      for (const f of files) {
        if (!f.endsWith('.jsonl.zstd')) continue
        out.push({ file: path.join(dir, f), sessionId: s.name, workspace: ws.name })
      }
    }
  }
  return out
}

function usageFromEvent(event) {
  const u = event && event.data && event.data.usage
  if (!u) return null
  const input = Number(u.inputTokens) || 0
  const cacheRead = Number(u.cacheReadTokens) || 0
  const cacheWrite = Number(u.cacheWriteTokens) || 0
  const output = Number(u.outputTokens) || 0
  if (!input && !cacheRead && !cacheWrite && !output) return null
  return { time: Number(event.time) || 0, input, cacheRead, cacheWrite, output }
}

async function scanUsage({ days = 30, force = false } = {}) {
  const startedAt = Date.now()
  const root = path.join(dshHome(), 'sessions')
  const files = await listSessionFiles(root)
  const cutoff = startedAt - (Math.max(days, 1) + 1) * DAY_MS
  const calls = []
  let scanned = 0
  let parsed = 0

  for (const entry of files) {
    let stat
    try {
      stat = await fsp.stat(entry.file)
    } catch {
      continue
    }
    scanned += 1
    if (stat.mtimeMs < cutoff) continue // 太久没写过的会话不可能有窗口内的调用
    const cached = fileCache.get(entry.file)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size && !force) {
      calls.push(...cached.calls)
      continue
    }
    let buf
    try {
      buf = await fsp.readFile(entry.file)
    } catch {
      continue
    }
    let events = []
    try {
      events = readSessionEvents(buf)
    } catch {
      continue
    }
    const fileCalls = []
    for (const event of events) {
      const usage = usageFromEvent(event)
      if (usage) fileCalls.push(usage)
    }
    parsed += 1
    fileCache.set(entry.file, { mtimeMs: stat.mtimeMs, size: stat.size, calls: fileCalls })
    calls.push(...fileCalls)
  }

  const buckets = new Map()
  const total = { requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
  for (const call of calls) {
    if (!call.time) continue
    const key = localDateKey(call.time)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { date: key, requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
      buckets.set(key, bucket)
    }
    bucket.requests += 1
    bucket.input += call.input
    bucket.cacheRead += call.cacheRead
    bucket.cacheWrite += call.cacheWrite
    bucket.output += call.output
    total.requests += 1
    total.input += call.input
    total.cacheRead += call.cacheRead
    total.cacheWrite += call.cacheWrite
    total.output += call.output
  }

  const series = [...buckets.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  const todayKey = localDateKey(Date.now())
  const sumWindow = (fromKey) => {
    const acc = { requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
    for (const b of series) {
      if (b.date < fromKey) continue
      acc.requests += b.requests
      acc.input += b.input
      acc.cacheRead += b.cacheRead
      acc.cacheWrite += b.cacheWrite
      acc.output += b.output
    }
    return withTotals(acc)
  }

  const last7Key = localDateKey(Date.now() - 6 * DAY_MS)
  const last30Key = localDateKey(Date.now() - 29 * DAY_MS)
  return {
    generatedAt: Date.now(),
    days,
    sessions: files.length,
    scanned,
    parsed,
    scanMs: Date.now() - startedAt,
    series: series.slice(-60).map(withTotals),
    today: sumWindow(todayKey),
    last7: sumWindow(last7Key),
    last30: sumWindow(last30Key),
    allTime: withTotals(total),
  }
}

function withTotals(b) {
  const totalTokens = b.input + b.cacheRead + b.cacheWrite + b.output
  const cacheable = b.input + b.cacheRead
  return {
    requests: b.requests,
    input: b.input,
    cacheRead: b.cacheRead,
    cacheWrite: b.cacheWrite,
    output: b.output,
    totalTokens,
    cacheHitRate: cacheable > 0 ? b.cacheRead / cacheable : 0,
    date: b.date,
  }
}

/* ------------------------------------------------------------------ *
 * 配置 & 余额
 * ------------------------------------------------------------------ */
let configCache = { mtimeMs: -1, value: {} }

async function readConfig() {
  try {
    const stat = await fsp.stat(configPath())
    if (stat.mtimeMs === configCache.mtimeMs) return configCache.value
    const raw = await fsp.readFile(configPath(), 'utf8')
    const value = JSON.parse(raw)
    configCache = { mtimeMs: stat.mtimeMs, value: value && typeof value === 'object' ? value : {} }
    return configCache.value
  } catch {
    configCache = { mtimeMs: -1, value: {} }
    return {}
  }
}

let balanceCache = { at: 0, payload: null }

async function queryBalance({ force = false } = {}) {
  if (!force && balanceCache.payload && Date.now() - balanceCache.at < BALANCE_TTL_MS) {
    return balanceCache.payload
  }
  const config = await readConfig()
  const apiKey = (process.env.DEEPSEEK_API_KEY || config.apiKey || '').trim()
  if (!apiKey) {
    const payload = {
      configured: false,
      ok: false,
      reason: 'missing-key',
      hint: `没有找到 DeepSeek API Key：设置环境变量 DEEPSEEK_API_KEY，或在 ${configPath()} 里写 {"apiKey": "sk-..."}`,
    }
    balanceCache = { at: Date.now(), payload }
    return payload
  }
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || config.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')
  const url = `${baseUrl}/user/balance`
  let payload
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(Number(config.timeoutMs) || 8000),
    })
    const text = await res.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
    if (!res.ok) {
      payload = {
        configured: true,
        ok: false,
        reason: `http-${res.status}`,
        status: res.status,
        hint: res.status === 401 ? 'API Key 无效或已过期' : `DeepSeek 返回 HTTP ${res.status}`,
        detail: body || text.slice(0, 300),
      }
    } else {
      const infos = Array.isArray(body && body.balance_infos) ? body.balance_infos : []
      payload = {
        configured: true,
        ok: true,
        available: Boolean(body && body.is_available),
        balances: infos.map((info) => ({
          currency: info.currency || 'CNY',
          total: info.total_balance ?? '0',
          granted: info.granted_balance ?? '0',
          toppedUp: info.topped_up_balance ?? '0',
        })),
        fetchedAt: Date.now(),
      }
    }
  } catch (error) {
    const message = error && error.message ? error.message : String(error)
    payload = {
      configured: true,
      ok: false,
      reason: message.includes('timed out') || message.includes('TimeoutError') ? 'timeout' : 'network',
      hint: '无法连接 DeepSeek 余额接口（需要能访问 api.deepseek.com）',
      detail: message.slice(0, 300),
    }
  }
  balanceCache = { at: Date.now(), payload }
  return payload
}

/* ------------------------------------------------------------------ *
 * HTTP 服务
 * ------------------------------------------------------------------ */
function allowedOrigin(origin) {
  if (!origin) return false
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin)
}

function sendJson(res, status, data, origin) {
  const body = JSON.stringify(data)
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  }
  if (allowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
    headers.Vary = 'Origin'
  }
  res.writeHead(status, headers)
  res.end(body)
}

async function handle(req, res) {
  const origin = req.headers.origin
  if (req.method === 'OPTIONS') {
    if (!allowedOrigin(origin)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('forbidden origin')
      return
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    })
    res.end()
    return
  }
  const url = new URL(req.url || '/', `http://${BIND_HOST}`)

  if (req.method === 'POST' && url.pathname === '/config') {
    if (!allowedOrigin(origin)) {
      sendJson(res, 403, { error: 'forbidden-origin' }, origin)
      return
    }
    let body = ''
    for await (const chunk of req) {
      body += chunk
      if (body.length > 8192) {
        sendJson(res, 413, { error: 'body-too-large' }, origin)
        return
      }
    }
    let input = {}
    try {
      input = body ? JSON.parse(body) : {}
    } catch {
      sendJson(res, 400, { error: 'invalid-json' }, origin)
      return
    }
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : undefined
    if (apiKey !== undefined && apiKey && !/^sk-[A-Za-z0-9._-]{8,}$/.test(apiKey)) {
      sendJson(res, 400, { error: 'invalid-key', hint: 'DeepSeek API Key 形如 sk-xxxxxxxx' }, origin)
      return
    }
    const current = await readConfig().catch(() => ({}))
    const next = { ...current }
    if (apiKey !== undefined) {
      if (apiKey) next.apiKey = apiKey
      else delete next.apiKey
    }
    if (typeof input.baseUrl === 'string' && input.baseUrl.trim()) next.baseUrl = input.baseUrl.trim()
    try {
      await fsp.mkdir(path.dirname(configPath()), { recursive: true })
      await fsp.writeFile(configPath(), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
    } catch (error) {
      sendJson(res, 500, { error: 'write-failed', detail: String(error && error.message) }, origin)
      return
    }
    configCache = { mtimeMs: -1, value: next }
    balanceCache = { at: 0, payload: null }
    sendJson(res, 200, { ok: true, saved: Boolean(next.apiKey), path: configPath() }, origin)
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method-not-allowed' }, origin)
    return
  }
  try {
    if (url.pathname === '/health') {
      sendJson(res, 200, { ok: true, name, version: '0.1.0', pid: process.pid }, origin)
      return
    }
    if (url.pathname === '/summary') {
      const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 365)
      const force = url.searchParams.get('force') === '1'
      sendJson(res, 200, await scanUsage({ days, force }), origin)
      return
    }
    if (url.pathname === '/balance') {
      const force = url.searchParams.get('force') === '1'
      sendJson(res, 200, await queryBalance({ force }), origin)
      return
    }
    sendJson(res, 404, { error: 'not-found', routes: ['/health', '/summary', '/balance'] }, origin)
  } catch (error) {
    sendJson(res, 500, { error: 'internal', detail: error && error.message ? error.message : String(error) }, origin)
  }
}

function startServer(ctx) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      try {
        sendJson(res, 500, { error: 'internal', detail: String(error && error.message) }, req.headers.origin)
      } catch {
        /* ignore */
      }
    })
  })
  let configPort = 0
  readConfig()
    .then((config) => {
      configPort = Number(config.port) || 0
    })
    .catch(() => {})

  const tryListen = (port, attempt = 0) => {
    server.once('error', (error) => {
      if (error && error.code === 'EADDRINUSE' && attempt < 3) {
        tryListen(port + 1, attempt + 1)
        return
      }
      ctx?.logger?.warn?.(`[dsh-usage-monitor] 监听 ${BIND_HOST}:${port} 失败：${error && error.message}`)
    })
    server.listen(port, BIND_HOST, () => {
      const actual = server.address()?.port
      ctx?.logger?.info?.(`[dsh-usage-monitor] http://${BIND_HOST}:${actual} （浏览器半读取该端口）`)
    })
  }

  const begin = async () => {
    const config = await readConfig().catch(() => ({}))
    const port = Number(config.port) || configPort || DEFAULT_PORT
    tryListen(port)
  }
  begin()

  return () => {
    try {
      server.close()
    } catch {
      /* ignore */
    }
  }
}

/** DSH 加载插件时调用。 */
export function apply(ctx) {
  const start = () => startServer(ctx)
  if (ctx && typeof ctx.effect === 'function') {
    ctx.effect(start, 'usage-monitor.server')
  } else {
    start()
  }
}

/* 直接 `node index.js` 时以独立模式运行，方便自测（不依赖 DSH）。 */
function isDirectRun() {
  if (!process.argv[1]) return false
  try {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}
if (isDirectRun()) {
  startServer({ logger: console })
}
