import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { getGlobalState } from './registry'
import { getSessionForEvent } from './session'
import { patchFetch } from './patch'
import type { NuxtSsrDevtoolsConfig } from './types'

export default defineNitroPlugin((nitroApp) => {
  const state = getGlobalState()
  const userConfig = (useRuntimeConfig() as { public?: { ssrDevtools?: Partial<NuxtSsrDevtoolsConfig> } }).public?.ssrDevtools
  if (userConfig) Object.assign(state.config, userConfig)
  if (!state.config.enabled) return

  patchFetch()

  // SSR fetch 캡처는 useEvent() 가 가리키는 H3Event 를 세션 키로 삼는다.
  // request 훅에서 미리 세션을 만들어둬야 같은 요청 내 첫 fetch 가
  // 호출되기 전에 sessionByEvent 매핑이 준비된다.
  nitroApp.hooks.hook('request', (event) => {
    if (!state.config.enabled) return
    getSessionForEvent(event as unknown as object)
  })

  // Nuxt SSR 결과 HTML 에 마커 삽입.
  // <script data-ssr-devtools data-ssr-devtools-request-id="..." data-ssr-devtools-api-path="..."/>
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    if (!state.config.enabled) return
    const session = getSessionForEvent(event as unknown as object)
    const marker = `<script data-ssr-devtools data-ssr-devtools-request-id="${session.requestId}" data-ssr-devtools-api-path="${state.config.apiPath}"></script>`
    html.bodyAppend.push(marker)
  })
})
