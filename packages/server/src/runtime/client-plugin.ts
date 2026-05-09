import { defineNuxtPlugin, useRouter, useRuntimeConfig } from '#imports'
import type { BodyCapture, FetchEntry, NuxtSsrDevtoolsConfig } from './types'

const DEFAULT_REDACT = ['authorization', 'cookie', 'set-cookie', 'x-api-key']
const DEFAULT_IGNORE = [
  '/__nuxt_vite_node__/',
  '/__nuxt_devtools__/',
  '/_nuxt/',
  '/_ipx/',
]
const DEFAULT_MAX_BODY = 100_000

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function readHeaders(
  source: HeadersInit | Headers | undefined,
  redact: string[],
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!source) return out
  const redactSet = new Set(redact.map(s => s.toLowerCase()))
  const set = (k: string, v: string) => {
    out[k] = redactSet.has(k.toLowerCase()) ? '[REDACTED]' : v
  }
  if (source instanceof Headers) {
    source.forEach((v, k) => set(k, v))
  }
  else if (Array.isArray(source)) {
    for (const [k, v] of source) set(k, String(v))
  }
  else {
    for (const [k, v] of Object.entries(source)) set(k, String(v))
  }
  return out
}

function isTextLike(contentType: string | null): boolean {
  if (!contentType) return true
  const ct = contentType.toLowerCase()
  return (
    ct.includes('text')
    || ct.includes('json')
    || ct.includes('xml')
    || ct.includes('javascript')
    || ct.includes('html')
    || ct.includes('urlencoded')
  )
}

function mergeChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return

  const publicConfig = (useRuntimeConfig().public as { ssrDevtools?: NuxtSsrDevtoolsConfig }).ssrDevtools ?? {}
  if (publicConfig.enabled === false) return

  const apiPath = publicConfig.apiPath ?? '/api/ssr-devtools'
  const maxBodySize = publicConfig.maxBodySize ?? DEFAULT_MAX_BODY
  const redactHeaders = publicConfig.redactHeaders ?? DEFAULT_REDACT
  const ignorePatterns = publicConfig.ignorePatterns ?? DEFAULT_IGNORE

  const marker = document.querySelector('script[data-ssr-devtools]') as HTMLScriptElement | null
  if (!marker) return

  let currentSessionId = marker.getAttribute('data-ssr-devtools-request-id') || generateId()

  const buffer: FetchEntry[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const original = window.fetch.bind(window)

  function isSelf(url: string): boolean {
    return url.includes(apiPath)
  }

  function shouldIgnore(url: string): boolean {
    return ignorePatterns.some(p => url.includes(p))
  }

  async function flush() {
    flushTimer = null
    if (buffer.length === 0) return
    const batch = buffer.splice(0, buffer.length)
    try {
      await original(apiPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId, entries: batch }),
      })
    }
    catch {
      // silent — losing devtools captures should not surface in app
    }
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(flush, 200)
  }

  async function captureResponseBody(response: Response): Promise<BodyCapture | null> {
    if (!response.body) return null
    let cloned: Response
    try { cloned = response.clone() }
    catch { return null }
    const contentType = cloned.headers.get('content-type')
    try {
      const reader = cloned.body!.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      let truncated = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBodySize) {
          const overshoot = total - maxBodySize
          const keep = value.byteLength - overshoot
          if (keep > 0) chunks.push(value.subarray(0, keep))
          truncated = true
          await reader.cancel()
          break
        }
        chunks.push(value)
      }
      const merged = mergeChunks(chunks)
      const data = isTextLike(contentType)
        ? new TextDecoder().decode(merged)
        : `[binary ${total} bytes]`
      return { data, truncated, byteLength: total, contentType }
    }
    catch (err) {
      return {
        data: `[read error: ${(err as Error).message}]`,
        truncated: false,
        byteLength: 0,
        contentType,
      }
    }
  }

  window.fetch = async function patchedFetch(input, init) {
    const url
      = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url

    if (isSelf(url) || shouldIgnore(url)) {
      return original(input as RequestInfo | URL, init)
    }

    const startedAt = Date.now()
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase()
    const reqHeadersSource
      = (init?.headers as HeadersInit | undefined)
        ?? (input instanceof Request ? input.headers : undefined)
    const requestHeaders = readHeaders(reqHeadersSource, redactHeaders)
    const id = generateId()

    let response: Response
    try {
      response = await original(input as RequestInfo | URL, init)
    }
    catch (err) {
      buffer.push({
        id,
        url,
        method,
        startedAt,
        durationMs: Date.now() - startedAt,
        status: null,
        statusText: null,
        ok: null,
        requestHeaders,
        responseHeaders: {},
        requestBody: null,
        responseBody: null,
        error: (err as Error).message,
      })
      scheduleFlush()
      throw err
    }

    const durationMs = Date.now() - startedAt
    const responseHeaders = readHeaders(response.headers, redactHeaders)

    captureResponseBody(response)
      .then((responseBody) => {
        buffer.push({
          id,
          url,
          method,
          startedAt,
          durationMs,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          requestHeaders,
          responseHeaders,
          requestBody: null,
          responseBody,
          error: null,
        })
        scheduleFlush()
      })
      .catch(() => {
        // body capture 실패해도 caller 응답엔 영향 없음
      })

    return response
  }

  // 라우트 전환 시 새 client 세션 생성 + 마커 갱신 + 서버 알림
  const router = useRouter()
  router.beforeEach(async (to) => {
    await flush()
    currentSessionId = generateId()
    marker.setAttribute('data-ssr-devtools-request-id', currentSessionId)
    try {
      await original(apiPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          url: to.fullPath,
          init: true,
        }),
      })
    }
    catch {
      // silent
    }
  })

  window.addEventListener('beforeunload', () => { flush() })
})
