export interface BodyCapture {
  data: string
  truncated: boolean
  byteLength: number
  contentType: string | null
}

export interface FetchEntry {
  id: string
  url: string
  method: string
  startedAt: number
  durationMs: number
  status: number | null
  statusText: string | null
  ok: boolean | null
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  requestBody: BodyCapture | null
  responseBody: BodyCapture | null
  error: string | null
}

export interface RequestSession {
  requestId: string
  startedAt: number
  entries: FetchEntry[]
}

export interface NuxtSsrDevtoolsConfig {
  enabled?: boolean
  maxBodySize?: number
  maxSessions?: number
  redactHeaders?: string[]
  apiPath?: string
  /**
   * URL substrings to skip recording. Default filters out Nuxt dev-mode
   * internals (vite-node module loading, devtools assets) so the panel only
   * shows real API calls. Pass `[]` to disable filtering entirely.
   */
  ignorePatterns?: string[]
}
