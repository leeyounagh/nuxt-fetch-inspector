import { defineNuxtModule, addServerHandler, addServerPlugin, addPlugin, createResolver } from '@nuxt/kit'
import type { NuxtSsrDevtoolsConfig } from './runtime/types'

export interface ModuleOptions extends NuxtSsrDevtoolsConfig {}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-ssr-devtools',
    configKey: 'ssrDevtools',
    compatibility: {
      nuxt: '^3.10.0',
    },
  },
  defaults: {
    enabled: process.env.NODE_ENV !== 'production',
    maxBodySize: 100_000,
    maxSessions: 200,
    redactHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
    apiPath: '/api/ssr-devtools',
    ignorePatterns: [
      '/__nuxt_vite_node__/',
      '/__nuxt_devtools__/',
      '/_nuxt/',
      '/_ipx/',
    ],
  },
  setup(options, nuxt) {
    if (!options.enabled) return

    const resolver = createResolver(import.meta.url)

    // h3 useEvent() 가 동작하려면 Nitro asyncContext 필수.
    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.experimental = nitroConfig.experimental ?? {}
      nitroConfig.experimental.asyncContext = true

      // public runtimeConfig 에 주입 → 서버 / 클라 양쪽에서 읽을 수 있음
      nitroConfig.runtimeConfig = nitroConfig.runtimeConfig ?? {}
      nitroConfig.runtimeConfig.public = nitroConfig.runtimeConfig.public ?? {}
      ;(nitroConfig.runtimeConfig.public as any).ssrDevtools = options
    })

    // 1. Nitro plugin: globalThis.fetch 패치 + render:html 훅 으로 마커 주입
    addServerPlugin(resolver.resolve('./runtime/nitro-plugin'))

    // 2. API route — GET 으로 세션 조회, POST 로 클라이언트 캡처 수집
    addServerHandler({
      route: options.apiPath,
      handler: resolver.resolve('./runtime/server-route'),
    })

    // 3. Client plugin: window.fetch 패치 + 라우트 전환 시 새 세션
    addPlugin({
      src: resolver.resolve('./runtime/client-plugin'),
      mode: 'client',
    })
  },
})

declare module '@nuxt/schema' {
  interface NuxtConfig {
    ssrDevtools?: ModuleOptions
  }
  interface NuxtOptions {
    ssrDevtools?: ModuleOptions
  }
}
