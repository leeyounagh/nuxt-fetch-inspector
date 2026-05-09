# nuxt-ssr-devtools

[![npm version](https://img.shields.io/npm/v/nuxt-ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/nuxt-ssr-devtools)
[![npm downloads](https://img.shields.io/npm/dm/nuxt-ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/nuxt-ssr-devtools)
[![license](https://img.shields.io/npm/l/nuxt-ssr-devtools.svg?style=flat-square)](https://github.com/leeyounagh/nuxt-fetch-inspector/blob/main/LICENSE)

> Inspect **Nuxt SSR `fetch()` calls** in Chrome DevTools.
> Companion server module for the Nuxt SSR DevTools Chrome extension.

🌐 [English](#english) | [한국어](#한국어)

---

## English

### Why

In Nuxt, `useFetch` / `$fetch` calls inside Server Components and pages run on
the Node.js server during SSR. The browser only receives the rendered HTML, so
**none of those fetches show up in the DevTools Network tab** — you can't see
URLs, headers, status codes, durations, or response bodies.

This module patches `globalThis.fetch` on the server, captures every SSR fetch
into an in-memory per-request session keyed on the H3Event, and exposes them
through a small marker `<script>` and an API route. Pair it with the
[SSR DevTools Chrome extension](https://github.com/leeyounagh/nuxt-fetch-inspector/tree/main/packages/extension)
to view captured fetches in a DevTools panel — like the Network tab, but for SSR.

### Install

**1. Server module** (this package):

```bash
npm install nuxt-ssr-devtools
```

**2. Chrome extension** — load unpacked from source:

Clone [the repo](https://github.com/leeyounagh/nuxt-fetch-inspector), open
`chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and
select `packages/extension/`.

Requirements: **Nuxt 3.10+** with Nitro 2.x.

### Setup (1 file)

**`nuxt.config.ts`** — register the module:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ssr-devtools'],
})
```

That's it. Open a Nuxt page, open DevTools, switch to the **Nuxt SSR Fetches**
panel.

The module automatically:
- Patches `globalThis.fetch` on the server (covers `useFetch`, `$fetch`, and any
  raw `fetch` call during SSR).
- Enables Nitro `experimental.asyncContext` so per-request `H3Event` is
  available to the patched fetch via `useEvent()`.
- Injects a `<script data-ssr-devtools>` marker into the SSR HTML carrying the
  request id and API path.
- Registers a `/api/ssr-devtools` route handler that returns the session data
  for the marker's request id.

### Usage notes

- **Initial page load** is captured automatically — the marker carries the
  initial render's session id, so SSR fetches that fire during the first render
  show up in the panel as soon as you open it.
- **Subsequent server-side requests** (server routes, route handlers,
  `$fetch` from a server action, etc.) execute in *new* request contexts with
  their own sessions. The panel does **not auto-refresh** for these — click the
  **Refresh** button after triggering a server-side action to merge the new
  fetches in.
- The panel auto-refreshes on full page navigation
  (`chrome.devtools.network.onNavigated`). Soft client-side navigations inside
  the same document also need a manual Refresh.
- Live polling / SSE push is planned; for now Refresh is the contract.

### Configuration

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ssr-devtools'],
  ssrDevtools: {
    enabled: true,                // disable in production by default
    maxBodySize: 100_000,         // bytes; bodies above this are truncated
    maxSessions: 200,             // recent sessions kept in memory
    redactHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
    apiPath: '/api/ssr-devtools', // route the extension reads from
  },
})
```

### How it works (one paragraph)

A Nitro plugin replaces `globalThis.fetch` with a wrapper that records every
call into a per-request session. Sessions are keyed on the `H3Event` returned
by `useEvent()` (from `nitropack/runtime`) — the same reference is shared
across all code paths in a single request. The Nitro `render:html` hook
appends a `<script data-ssr-devtools>` marker carrying the request id; the
API route returns the session for that id. The Chrome extension reads the
marker and hits the API.

### License

MIT — see [LICENSE](https://github.com/leeyounagh/nuxt-fetch-inspector/blob/main/LICENSE).

---

## 한국어

### 왜 필요한가요

Nuxt에서 `useFetch` / `$fetch` 는 SSR 시 Node.js 서버 안에서 일어납니다.
브라우저는 렌더된 HTML만 받기 때문에 **어떤 SSR fetch도 DevTools의 Network
탭에 보이지 않습니다** — URL, 헤더, 상태 코드, 응답 시간, response body
모두 확인할 길이 없습니다.

이 모듈은 서버에서 `globalThis.fetch` 를 가로채 H3Event 를 키로 한 요청별
세션에 SSR fetch를 모으고, 작은 `<script>` 마커와 API route로 브라우저에
노출합니다.
[SSR DevTools Chrome 익스텐션](https://github.com/leeyounagh/nuxt-fetch-inspector/tree/main/packages/extension)
과 함께 쓰면 DevTools 패널에서 SSR fetch 목록을 볼 수 있어요 — Network
탭처럼 생긴, 그러나 SSR 전용 패널이라고 보시면 됩니다.

### 설치

**1. 서버 모듈** (이 패키지):

```bash
npm install nuxt-ssr-devtools
```

**2. Chrome 익스텐션** — 소스에서 직접 로드:

[저장소](https://github.com/leeyounagh/nuxt-fetch-inspector)를 clone 후
`chrome://extensions` → **개발자 모드** 켜고 → **압축해제된 확장 프로그램을
로드합니다** → `packages/extension/` 폴더 선택.

요구사항: **Nuxt 3.10+** + Nitro 2.x.

### 설정 (파일 1개)

**`nuxt.config.ts`** — 모듈 등록:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ssr-devtools'],
})
```

끝입니다. Nuxt 페이지 열고 DevTools 열어서 **Nuxt SSR Fetches** 탭 클릭하세요.

모듈이 자동으로 다음을 처리합니다:
- 서버의 `globalThis.fetch` 패치 (`useFetch`, `$fetch`, raw `fetch` 모두 포함)
- Nitro `experimental.asyncContext` 활성화 — `useEvent()` 로 요청별 `H3Event`
  접근 가능하게
- SSR HTML 에 `<script data-ssr-devtools>` 마커 삽입 (request id + API path)
- `/api/ssr-devtools` route 핸들러 등록 — request id 로 세션 데이터 반환

### 사용 시 주의사항

- **첫 페이지 로드** 의 SSR fetch 는 자동으로 잡힙니다 — 마커가 초기 렌더 세션
  ID 를 들고 있어서 패널 열면 바로 보입니다.
- **그 다음 서버사이드 요청** (server route, route handler, server action 등)
  은 각각 **새 request context** + **새 세션** 으로 실행됩니다. 패널은 이런
  요청에 대해 **자동 갱신되지 않으므로**, 트리거 후 패널의 **Refresh 버튼**
  을 눌러야 새 fetch 가 표시됩니다.
- 풀 페이지 네비게이션 시에는 자동 갱신됩니다
  (`chrome.devtools.network.onNavigated`). soft client-side 네비게이션은
  수동 Refresh 필요.
- 실시간 폴링 / SSE 푸시는 로드맵에 있습니다. 당분간은 Refresh 가 약속.

### 설정 옵션

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ssr-devtools'],
  ssrDevtools: {
    enabled: true,                // production은 기본 비활성
    maxBodySize: 100_000,         // bytes; 초과 시 truncate
    maxSessions: 200,             // 메모리에 보관할 최근 세션 수
    redactHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
    apiPath: '/api/ssr-devtools', // 익스텐션이 호출할 route
  },
})
```

### 동작 원리 (한 문단)

Nitro 플러그인이 `globalThis.fetch` 를 우리 wrapper로 갈아치워서 모든 호출을
요청별 세션에 기록합니다. 세션 키는 `nitropack/runtime` 의 `useEvent()` 가
반환하는 `H3Event` — 한 요청 내 모든 코드 경로에서 같은 reference 라서
useFetch / $fetch / raw fetch 가 같은 세션에 모입니다. Nitro 의 `render:html`
훅이 request id 가 박힌 `<script data-ssr-devtools>` 를 SSR HTML 에 주입하고,
API route 는 그 id 로 세션을 돌려줍니다. Chrome 익스텐션이 마커에서 id 읽어
API 를 호출하는 구조.

### 라이선스

MIT — [LICENSE](https://github.com/leeyounagh/nuxt-fetch-inspector/blob/main/LICENSE) 참조.
