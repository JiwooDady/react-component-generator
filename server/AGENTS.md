# server/AGENTS.md

## Module Context

Bun 기반 API 프록시. 클라이언트 요청을 Anthropic/Google API로 전달하고, 응답 텍스트를 `react-live`에서 실행 가능한 코드로 정규화해 반환한다. 순수 로직은 `generator.ts`, `fallback.ts`에, `Bun.serve` 부수효과는 `index.ts`에 있다.

## Tech Stack & Constraints

- 런타임은 Bun. `Bun.serve`와 전역 `fetch`를 사용하고 AI SDK나 HTTP 클라이언트 라이브러리는 쓰지 않는다 (`index.ts:69`, `index.ts:101`는 직접 `fetch` 호출).
- `server/`는 어떤 tsconfig에도 포함되지 않아 `bun run build`가 타입을 검사하지 않는다. 수정 후 타입 안정성은 직접 확인한다.
- 환경변수는 `process.env.ANTHROPIC_API_KEY`, `process.env.GOOGLE_API_KEY`만 사용한다 (`index.ts:59-62`). 키 우선순위는 클라이언트 입력, 그다음 환경변수 (`index.ts:64-66`).

## Implementation Patterns

- 모든 응답은 `CORS_HEADERS`를 포함한다 (`index.ts:51-55`). 새 엔드포인트나 에러 분기에서 헤더를 빠뜨리지 않는다.
- 새 AI 호출 함수는 `callAnthropic`/`callGoogleModel`과 같은 시그니처 `(prompt, apiKey) => Promise<string>`을 따르고, 결과를 `ensureRenderCall(stripCodeFences(text))`로 후처리한다 (`index.ts:188`).
- 순수 함수는 `generator.ts`/`fallback.ts` 스타일로 작성한다: 부수효과 없음, 파일 상단에 한국어 주석, `export function`.

## Testing Strategy

- 테스트는 `*.test.ts`를 같은 폴더에 두고 vitest로 실행한다: `bunx vitest run server/`.
- 테스트 대상은 순수 모듈뿐이다 (`generator.test.ts`, `fallback.test.ts`). `index.ts`는 import 시점에 서버가 시작되므로(`index.ts:138`) 테스트에서 import하지 않는다.
- 새 로직은 `index.ts`에 넣지 말고 순수 모듈로 분리해 테스트를 함께 작성한다. 테스트 이름은 한국어 문장으로 쓴다 (`generator.test.ts:5`).

## Local Golden Rules

### Security Boundary

- Google 호출은 키가 URL 쿼리에 포함된다 (`index.ts:99`). 이 URL을 로그나 에러 메시지에 출력하지 않는다. 에러는 상태 코드만 담는다 (`index.ts:112`).

### Double Defense (한쪽만 제거 금지)

- `render()` 호출: 프롬프트가 요구하고 (`index.ts:12`), `ensureRenderCall`이 보정한다 (`index.ts:188`).
- 코드펜스: 프롬프트가 금지하고 (`index.ts:16`), `stripCodeFences`가 제거한다 (`generator.ts:5`).
- 생성 코드는 import 없이 전역 `React`를 쓰는 순수 JS여야 한다 (`index.ts:11`, `index.ts:20`). `SYSTEM_PROMPT`에서 이 제약을 바꾸면 클라이언트 실행 방식(`src/components/LivePreview.tsx`)도 함께 확인한다.

### Asymmetry (프로바이더별 처리가 다르다)

- Google만 모델 폴백(`GOOGLE_MODELS`, `index.ts:5`, `index.ts:134-136`)과 `MAX_TOKENS` 잘림 검사(`index.ts:123`)가 있다. Anthropic은 단일 모델·`max_tokens: 4096`이고 잘림 검사가 없다 (`index.ts:77-78`). 프로바이더 로직을 수정할 때 다른 쪽에도 같은 처리가 필요한지 판단한다.
- 에러 상태 매핑은 메시지 문자열에 `503`/`429`가 포함되는지로 판정한다 (`index.ts:194`, `index.ts:201`). 새 호출 함수는 `API error: ${status}` 형태로 상태 코드를 메시지에 담아야 한다 (`index.ts:85`, `index.ts:112`). 폴백이 모든 에러를 삼키고 마지막 에러만 던지므로 (`fallback.ts:11-19`) 이 문자열 매핑은 마지막 모델의 에러 기준이다.
