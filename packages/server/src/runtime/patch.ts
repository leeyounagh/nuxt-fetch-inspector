import { randomUUID } from 'node:crypto'
import { getGlobalState } from './registry'
import { getCurrentSession } from './session'
import type { BodyCapture, FetchEntry } from './types'

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

async function captureResponseBody(
  response: Response,
  maxBytes: number,
): Promise<BodyCapture | null> {
  if (!response.body) return null
  const cloned = response.clone()
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
      if (total > maxBytes) {
        const overshoot = total - maxBytes
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

async function captureRequestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  maxBytes: number,
): Promise<BodyCapture | null> {
  const body = init?.body
  if (body != null) {
    if (typeof body === 'string') {
      const truncated = body.length > maxBytes
      return {
        data: truncated ? body.slice(0, maxBytes) : body,
        truncated,
        byteLength: body.length,
        contentType: null,
      }
    }
    if (body instanceof URLSearchParams) {
      const s = body.toString()
      return {
        data: s,
        truncated: false,
        byteLength: s.length,
        contentType: 'application/x-www-form-urlencoded',
      }
    }
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const obj: Record<string, string> = {}
      for (const [k, v] of body.entries()) {
        obj[k] = typeof v === 'string' ? v : `[file: ${(v as File).name}]`
      }
      return {
        data: JSON.stringify(obj),
        truncated: false,
        byteLength: 0,
        contentType: 'multipart/form-data',
      }
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      const len = body instanceof ArrayBuffer ? body.byteLength : (body.byteLength ?? 0)
      return { data: '[binary]', truncated: false, byteLength: len, contentType: null }
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) {
      return {
        data: '[blob]',
        truncated: false,
        byteLength: body.size,
        contentType: body.type || null,
      }
    }
    if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
      return { data: '[stream]', truncated: false, byteLength: 0, contentType: null }
    }
    return { data: '[unknown body type]', truncated: false, byteLength: 0, contentType: null }
  }

  if (typeof Request !== 'undefined' && input instanceof Request && input.body) {
    const cloned = input.clone()
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
        if (total > maxBytes) {
          const overshoot = total - maxBytes
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
    catch {
      return null
    }
  }
  return null
}

export function ensurePatched(): void {
  patchFetch()
}

export function patchFetch(): void {
  const state = getGlobalState()
  if (!state.config.enabled) return

  if (state.wrapped && globalThis.fetch === state.wrapped) return

  const original = state.original ?? globalThis.fetch
  if (!original) return
  state.original = original

  const wrapped: typeof fetch = async (input, init) => {
    const config = state.config
    const startedAt = Date.now()
    const url
      = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase()
    const reqHeadersSource
      = (init?.headers as HeadersInit | undefined)
        ?? (input instanceof Request ? input.headers : undefined)
    const requestHeaders = readHeaders(reqHeadersSource, config.redactHeaders)
    const requestBody = await captureRequestBody(input, init, config.maxBodySize)
    const id = randomUUID()

    let response: Response
    try {
      response = await original(input as RequestInfo | URL, init)
    }
    catch (err) {
      const entry: FetchEntry = {
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
        requestBody,
        responseBody: null,
        error: (err as Error).message,
      }
      getCurrentSession()?.entries.push(entry)
      throw err
    }

    const durationMs = Date.now() - startedAt
    const responseHeaders = readHeaders(response.headers, config.redactHeaders)
    captureResponseBody(response, config.maxBodySize)
      .then((responseBody) => {
        const entry: FetchEntry = {
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
          requestBody,
          responseBody,
          error: null,
        }
        getCurrentSession()?.entries.push(entry)
      })
      .catch(() => {
        // body capture 실패해도 caller 응답엔 영향 없음 — silent skip.
      })
    return response
  }

  globalThis.fetch = wrapped
  state.wrapped = wrapped
  state.patched = true
}
