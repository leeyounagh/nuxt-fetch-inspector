import { defineEventHandler, getQuery, setResponseHeaders, setResponseStatus } from 'h3'
import { getGlobalState, getSession, listRecentSessions } from './registry'
import { patchFetch } from './patch'

export default defineEventHandler((event) => {
  const state = getGlobalState()
  if (!state.config.enabled) {
    setResponseStatus(event, 404)
    return { error: 'disabled' }
  }
  // Self-heal: extension polling 시점에도 fetch 패치 상태 보장.
  patchFetch()

  setResponseHeaders(event, {
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  })

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
