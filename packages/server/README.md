# nuxt-ssr-devtools

[![npm version](https://img.shields.io/npm/v/nuxt-ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/nuxt-ssr-devtools)
[![npm downloads](https://img.shields.io/npm/dm/nuxt-ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/nuxt-ssr-devtools)
[![Chrome Web Store](https://img.shields.io/badge/chrome-web%20store-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/nuxt-ssr-devtools/cnjenbfkmledelckedgbookjppiddppe)
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
[Nuxt SSR DevTools Chrome extension](https://chromewebstore.google.com/detail/nuxt-ssr-devtools/cnjenbfkmledelckedgbookjppiddppe)
to view captured fetches in a DevTools panel — like the Network tab, but for SSR.

### Install

**1. Server module** (this package):

```bash
npm install nuxt-ssr-devtools
```

**2. Chrome extension** — pick one:

- **Recommended:** [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/nuxt-ssr-devtools/cnjenbfkmledelckedgbookjppiddppe).
- Or load unpacked from source: clone [the repo](https://github.com/leeyounagh/nuxt-fetch-inspector),
  open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
  and select `packages/extension/`.

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

- **Initial page load (SSR)** — `useFetch` / `$fetch` / raw `fetch` running on
  the server are captured into a session keyed on the `H3Event`.
- **Client-side navigation (NuxtLink)** — since v0.2.0, `window.fetch` on the
  browser is also patched. Each route change starts a new client session, the
  DOM marker is updated, and captured fetches are POSTed to the server's
  registry in 200ms-debounced batches. Result: the panel auto-updates as you
  click around without needing hard refresh.
- The panel auto-refreshes on full page navigation
  (`chrome.devtools.network.onNavigated`) and polls every 2s. Manual **Refresh**
  is still useful for edge cases (e.g. server actions completing after the
  poll window).
- Live SSE push is planned.

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
    ignorePatterns: [             // url substrings to skip recording
      '/__nuxt_vite_node__/',     // (defaults filter Nuxt dev-mode internals
      '/__nuxt_devtools__/',      //  so the panel only shows real API calls;
      '/_nuxt/',                  //  pass [] to disable filtering)
      '/_ipx/',
    ],
  },
})
```

### How it works

**Server side** — A Nitro plugin replaces `globalThis.fetch` with a wrapper
that records every call into a per-request session, keyed on the `H3Event`
returned by `useEvent()` (from `nitropack/runtime`). The `render:html` hook
appends a `<script data-ssr-devtools>` marker carrying the request id; the
API route returns the session for that id.

**Client side (v0.2.0+)** — A Nuxt plugin (`mode: 'client'`) patches
`window.fetch` on the browser. On each Vue Router `beforeEach`, the plugin
flushes any buffered captures, generates a new client session id, updates
the DOM marker, and POSTs `{ sessionId, init: true }` to the API. Captured
fetches are POSTed to the same API in 200ms-debounced batches and stored
alongside SSR sessions in the same in-memory registry.

The Chrome extension panel reads the marker on every poll and merges the
marker's session with other recently-started sessions, so SSR and client
captures appear together on one timeline.

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
[Nuxt SSR DevTools Chrome 익스텐션](https://chromewebstore.google.com/detail/nuxt-ssr-devtools/cnjenbfkmledelckedgbookjppiddppe)
과 함께 쓰면 DevTools 패널에서 SSR fetch 목록을 볼 수 있어요 — Network
탭처럼 생긴, 그러나 SSR 전용 패널이라고 보시면 됩니다.

### 설치

**1. 서버 모듈** (이 패키지):

```bash
npm install nuxt-ssr-devtools
```

**2. Chrome 익스텐션** — 두 가지 방법 중 선택:

- **권장:** [Chrome Web Store 에서 설치](https://chromewebstore.google.com/detail/nuxt-ssr-devtools/cnjenbfkmledelckedgbookjppiddppe).
- 또는 소스에서 직접 로드: [저장소](https://github.com/leeyounagh/nuxt-fetch-inspector) clone 후
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

- **첫 페이지 로드 (SSR)** — 서버에서 실행되는 `useFetch` / `$fetch` /
  raw `fetch` 는 `H3Event` 를 키로 하는 세션에 자동으로 잡힙니다.
- **클라이언트 사이드 네비게이션 (NuxtLink)** — v0.2.0 부터 브라우저의
  `window.fetch` 도 패치됩니다. 매 라우트 전환 시 새 client 세션이 생성되고,
  DOM 마커가 업데이트되며, 캡처된 fetch 들은 200ms 디바운스 배치로 서버
  registry 에 POST 됩니다. 결과: 페이지 클릭만 해도 panel 이 자동 갱신.
- 패널은 풀 페이지 네비게이션 (`chrome.devtools.network.onNavigated`) 에
  자동 갱신되고 2초마다 폴링합니다. 엣지 케이스 (서버 액션이 폴링 직후
  완료 등) 에선 수동 **Refresh** 버튼 사용.
- 실시간 SSE 푸시는 로드맵.

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
    ignorePatterns: [             // url 부분일치로 제외 (Nuxt dev 내부 요청)
      '/__nuxt_vite_node__/',     // (기본값은 vite-node, devtools, _nuxt assets
      '/__nuxt_devtools__/',      //  를 거름. 비활성화하려면 [] 전달)
      '/_nuxt/',
      '/_ipx/',
    ],
  },
})
```

### 동작 원리

**서버 사이드** — Nitro 플러그인이 `globalThis.fetch` 를 wrapper 로 갈아치워
요청별 세션에 기록합니다. 세션 키는 `nitropack/runtime` 의 `useEvent()` 가
반환하는 `H3Event` — 한 요청 내 모든 코드 경로에서 같은 reference. Nitro 의
`render:html` 훅이 request id 가 박힌 `<script data-ssr-devtools>` 를 SSR
HTML 에 주입하고, API route 는 그 id 로 세션을 돌려줍니다.

**클라이언트 사이드 (v0.2.0+)** — `mode: 'client'` 로 등록된 Nuxt 플러그인이
브라우저의 `window.fetch` 를 패치합니다. Vue Router `beforeEach` 마다 버퍼된
캡처를 flush, 새 client 세션 ID 생성, DOM 마커 갱신, 서버에 init POST.
캡처된 fetch 들은 200ms 디바운스 배치로 서버 API 에 POST 되어 SSR 세션과
동일한 in-memory registry 에 저장됩니다.

Chrome 익스텐션은 마커에서 id 읽어 해당 세션 + 최근 시작된 다른 세션들을
머지해서 보여주므로, SSR 캡처와 client 캡처가 한 타임라인에 함께 표시됩니다.

### 라이선스

MIT — [LICENSE](https://github.com/leeyounagh/nuxt-fetch-inspector/blob/main/LICENSE) 참조.
