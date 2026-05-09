# nuxt-ssr-devtools

[![한국어](https://img.shields.io/badge/lang-한국어-blue?style=flat-square)](./README.md) [![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](./README.en.md)

> **Nuxt SSR fetch 디버깅용 Chrome DevTools 익스텐션 + 서버 모듈**

[![npm version](https://img.shields.io/npm/v/nuxt-ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/nuxt-ssr-devtools)
[![npm downloads](https://img.shields.io/npm/dm/nuxt-ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/nuxt-ssr-devtools)
[![license](https://img.shields.io/npm/l/nuxt-ssr-devtools.svg?style=flat-square)](./LICENSE)

![Nuxt SSR Fetches DevTools 패널 미리보기](./docs/preview.png)

> ⚠️ **두 가지를 모두 설치해야 동작합니다**
>
> 1. **npm 패키지** 를 Nuxt 앱에 설치하고 `nuxt.config.ts` 에 module 등록 → 서버에서 SSR fetch 데이터가 수집됩니다.
> 2. **Chrome 익스텐션** 을 소스에서 직접 로드해야 DevTools 의 "Nuxt SSR Fetches" 패널에서 그 데이터를 볼 수 있습니다.
>
> 패키지만 설치하면 데이터는 모이지만 보여줄 UI 가 없습니다. 익스텐션만 설치하면 읽을 데이터가 없습니다.

## 빠른 설치

```bash
npm install nuxt-ssr-devtools
```

📦 **npm**: https://www.npmjs.com/package/nuxt-ssr-devtools

위 명령으로 npm 패키지를 설치한 뒤 [통합 가이드](#nuxt-프로젝트에-통합하기)대로 `nuxt.config.ts` 에 한 줄 추가하고, [익스텐션 설치](#익스텐션-설치) 섹션에 따라 Chrome 익스텐션까지 설치하면 끝.

---

## 문제: SSR 데이터 패칭은 디버깅이 어렵다

Nuxt 에서 `useFetch` / `$fetch` 는 SSR 시 **Node.js 서버 안에서만** 실행됩니다. 브라우저는 그 결과로 만들어진 HTML 만 받기 때문에, **개발자 도구의 Network 탭에는 아무것도 찍히지 않습니다.**

그 결과:
- 어떤 URL 을 어떤 method 로 호출했는지 안 보임
- request/response 헤더를 확인할 수 없음
- response body 를 까볼 수가 없음
- 응답 시간(latency) 도 모름
- QA/PM 같은 비개발자가 "이 페이지에서 정확히 무슨 데이터를 받아오는지" 확인할 방법이 없음

대안인 `console.log` 나 nitro dev 출력은 터미널에만 찍혀서 비개발자가 못 보고, OpenTelemetry/Sentry 는 무겁고 별도 백엔드가 필요합니다.

## 해결: 서버에서 잡아서 → DevTools 패널로

이 프로젝트는 두 부분으로 구성됩니다.

```
┌──────────────────────────────┐         ┌──────────────────────────┐
│  Nuxt Nitro 서버              │         │  브라우저                │
│                              │         │                          │
│  globalThis.fetch 를 패치     │         │   DevTools "Nuxt SSR     │
│  → URL/method/status/        │  HTML   │   Fetches" 패널이        │
│    duration/headers/body     │ ──────► │   <script> 마커에서      │
│    수집                       │         │   requestId 읽고         │
│                              │         │   API 호출 →             │
│  메모리 registry에 세션별     │         │   테이블 + 디테일 렌더    │
│  보관                         │ ◄────── │                          │
│  /api/ssr-devtools 로 조회    │  fetch  │                          │
└──────────────────────────────┘         └──────────────────────────┘
```

**개발자**는 Nuxt 앱에 `npm install` 한 번 + `nuxt.config.ts` 한 줄 추가 → 끝.
**비개발자(QA/PM)** 는 Chrome 익스텐션 1번 설치 → DevTools 열고 "Nuxt SSR Fetches" 탭 클릭 → 끝.

## 어떤 원리로 만들어졌는지

### 1. SSR fetch 를 가로채기 — `globalThis.fetch` monkey-patch

Nuxt 모듈이 등록한 Nitro 플러그인이 서버 부팅 시점에 한 번 실행됩니다. 여기서 `globalThis.fetch` 를 우리 wrapper 로 갈아치웁니다. 이후 `useFetch` / `$fetch` / raw `fetch` 가 부르는 모든 fetch 는 우리 wrapper 를 거치게 됩니다.

```ts
const original = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const startedAt = Date.now()
  const response = await original(input, init)
  // URL, method, status, duration, headers, body 수집
  recordEntry({ ... })
  return response
}
```

Body 는 stream 이라 한 번만 읽을 수 있어서 `response.clone()` 으로 복제 후 size limit (기본 100KB) 안에서 읽고 잘라냅니다.

### 2. 같은 요청의 fetch 끼리 묶기 — `useEvent()` + WeakMap

여러 fetch 가 일어나면 어느 요청에 속한 건지 묶어야 합니다. Nuxt/Nitro 환경에서는 **`nitropack/runtime` 의 `useEvent()` 가 현재 요청의 `H3Event` reference 를 리턴**합니다. 한 요청 내 모든 코드 경로에서 같은 reference 라서 `WeakMap<H3Event, Session>` 으로 깔끔하게 키잉할 수 있습니다.

```ts
import { useEvent } from 'nitropack/runtime'

function getCurrentSession() {
  const event = useEvent() // same reference within one request
  let session = sessionByEvent.get(event)
  if (!session) {
    session = { requestId: randomUUID(), entries: [] }
    sessionByEvent.set(event, session)
  }
  return session
}
```

이 작동을 위해 모듈이 `nitro.experimental.asyncContext: true` 를 자동으로 활성화합니다.

### 3. 브라우저로 데이터 전달 — `<script>` 마커 + API route

서버에서 모은 데이터를 브라우저로 전달하기 위해 두 부품이 추가됩니다.

**Nitro `render:html` 훅** — 매 SSR 응답 직전에 마커를 body 에 삽입:
```html
<script data-ssr-devtools data-ssr-devtools-request-id="..." data-ssr-devtools-api-path="/api/ssr-devtools"></script>
```

**`/api/ssr-devtools` route handler**: requestId 로 메모리 registry 에서 세션을 꺼내 JSON 으로 응답합니다.

### 4. Chrome DevTools 익스텐션

MV3 익스텐션이고 별도 host_permissions 가 필요 없습니다 (`chrome.devtools.inspectedWindow.eval` 로 페이지 컨텍스트에서 직접 fetch).

```js
// 1. 페이지에서 마커 읽기
const { requestId, apiPath } = readMarker()
// 2. 같은 origin 으로 fetch (브라우저가 처리하므로 권한 불필요)
const session = await fetch(apiPath + '?id=' + requestId).then(r => r.json())
// 3. 테이블 + 디테일 패널 렌더
```

페이지 네비게이션 시(`chrome.devtools.network.onNavigated`) 자동 갱신.

## 패키지 구성

| 위치 | 내용 |
|---|---|
| `packages/server/` | `nuxt-ssr-devtools` — Nuxt 앱이 설치할 npm 패키지 (모듈) |
| `packages/extension/` | Chrome MV3 DevTools 익스텐션 |
| `examples/nuxt-demo/` | 동작 검증용 데모 앱 |

## Nuxt 프로젝트에 통합하기

> 요구사항: **Nuxt 3.10+** + Nitro 2.x.

### 1. 패키지 설치

```bash
npm install nuxt-ssr-devtools
```

### 2. `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ssr-devtools'],
})
```

끝입니다. Nuxt 페이지 열고 DevTools 열어서 **Nuxt SSR Fetches** 탭 클릭하세요.

모듈이 자동으로 다음을 처리합니다:
- 서버의 `globalThis.fetch` 패치
- Nitro `experimental.asyncContext` 활성화
- SSR HTML 에 마커 삽입
- `/api/ssr-devtools` route 등록

## 익스텐션 설치

소스에서 직접 로드:

1. 이 저장소를 clone 하거나 [ZIP 으로 다운로드](https://github.com/leeyounagh/nuxt-fetch-inspector/archive/refs/heads/main.zip) 후 압축 해제
2. `chrome://extensions` 열기
3. 우측 상단 **개발자 모드** 켜기
4. **압축해제된 확장 프로그램을 로드합니다** → `packages/extension/` 폴더 선택
5. Nuxt 페이지 열고 DevTools(F12) → **Nuxt SSR Fetches** 탭

## 사용 시 주의사항

- **첫 페이지 로드** 의 SSR fetch 는 자동으로 잡힙니다 — 마커가 초기 렌더 세션 ID 를 들고 있어서 패널 열면 바로 보입니다.
- **그 다음 서버사이드 요청** (server route, route handler, server action 등) 은 각각 **새 request context** + **새 세션** 으로 실행됩니다. 패널은 이런 요청에 대해 **자동 갱신되지 않으므로**, 트리거 후 패널의 **Refresh 버튼** 을 눌러야 새 fetch 가 표시됩니다.
- 풀 페이지 네비게이션 시에는 자동 갱신됩니다 (`chrome.devtools.network.onNavigated`). soft client-side 네비게이션은 수동 Refresh 필요.
- 실시간 폴링 / SSE 푸시는 로드맵에 있습니다. 당분간은 Refresh 가 약속.

## 설정 옵션

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ssr-devtools'],
  ssrDevtools: {
    enabled: true,                // production은 기본 비활성
    maxBodySize: 100_000,         // bytes; 이상이면 truncate
    maxSessions: 200,             // 메모리에 보관할 최근 세션 수
    redactHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
    apiPath: '/api/ssr-devtools', // 익스텐션이 호출할 route
  },
})
```

## 로컬 개발

```bash
npm install
npm run build               # 서버 모듈 빌드
npm run demo                # 데모 앱 실행 → http://localhost:3000
```

`packages/server/src/*` 수정 후 그 워크스페이스에서 `npm run build` 다시 돌리고, demo 는 재시작.

## License

MIT
