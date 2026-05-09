import { randomUUID } from 'node:crypto'
import { useEvent } from 'h3'
import { getGlobalState, rememberSession } from './registry'
import type { RequestSession } from './types'

export function getCurrentSession(): RequestSession | null {
  let event: object | undefined
  try {
    event = useEvent() as unknown as object
  }
  catch {
    return null
  }
  if (!event) return null

  const state = getGlobalState()
  let session = state.sessionByEvent.get(event)
  if (!session) {
    session = {
      requestId: randomUUID(),
      startedAt: Date.now(),
      entries: [],
    }
    state.sessionByEvent.set(event, session)
    rememberSession(session)
  }
  return session
}

export function getSessionForEvent(event: object): RequestSession {
  const state = getGlobalState()
  let session = state.sessionByEvent.get(event)
  if (!session) {
    session = {
      requestId: randomUUID(),
      startedAt: Date.now(),
      entries: [],
    }
    state.sessionByEvent.set(event, session)
    rememberSession(session)
  }
  return session
}
