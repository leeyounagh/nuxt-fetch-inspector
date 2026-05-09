import {
  defineEventHandler,
  getMethod,
  getQuery,
  readBody,
  setResponseHeaders,
  setResponseStatus,
} from 'h3'
import { getGlobalState, getSession, listRecentSessions, rememberSession } from './registry'
import { patchFetch } from './patch'
import type { FetchEntry } from './types'

export default defineEventHandler(async (event) => {
  const state = getGlobalState()
  if (!state.config.enabled) {
    setResponseStatus(event, 404)
    return { error: 'disabled' }
  }
  patchFetch()

  setResponseHeaders(event, {
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  })

  const method = getMethod(event)

  if (method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }

  // 클라이언트 사이드 fetch 캡처 받기
  if (method === 'POST') {
    const body = (await readBody(event)) as
      | { sessionId?: string, entries?: FetchEntry[], url?: string, init?: boolean }
      | undefined
    const sessionId = body?.sessionId
    if (!sessionId) {
      setResponseStatus(event, 400)
      return { error: 'missing_session_id' }
    }

    let session = getSession(sessionId)
    if (!session) {
      session = {
        requestId: sessionId,
        startedAt: Date.now(),
        entries: [],
      }
      rememberSession(session)
    }

    if (Array.isArray(body?.entries)) {
      session.entries.push(...body.entries)
    }

    return { ok: true, count: session.entries.length }
  }

  // 기본: GET
  const query = getQuery(event)
  const id = typeof query.id === 'string' ? query.id : undefined
  if (id) {
    const session = getSession(id)
    if (!session) {
      setResponseStatus(event, 404)
      return { error: 'not_found' }
    }
    return session
  }
  return { sessions: listRecentSessions(50) }
})
