# src/AGENTS.md

## Module Context

React 19 SPA. 프롬프트 입력, 프로바이더/키 설정, 생성 결과 카드(미리보기/코드)를 렌더링한다. 서버와는 `/api/config`, `/api/generate`로만 통신하며 Vite 프록시를 거친다 (`vite.config.ts:8-13`).

## Tech Stack & Constraints

- 상태 관리 라이브러리 없이 `useState`와 커스텀 훅(`hooks/useComponentGenerator.ts`)만 쓴다. 스타일은 `App.css`/`index.css`의 클래스명 방식이다.
- `tsconfig.app.json` 제약: `verbatimModuleSyntax`(타입은 `import type`, `App.tsx:5`), `erasableSyntaxOnly`(enum, namespace, 파라미터 프로퍼티 금지), `noUnusedLocals`/`noUnusedParameters`. 위반 시 `bun run build`가 실패한다.
- 서버 호출은 상대 경로 `/api/...`만 사용한다 (`useComponentGenerator.ts:23`, `App.tsx:25`). 절대 URL이나 포트를 코드에 쓰지 않는다.

## Implementation Patterns

- 컴포넌트는 `components/`에 `export function Name({ props }: NameProps)` 형태의 named export로 만든다. `App`만 default export다 (`App.tsx:183`).
- 컴포넌트 props 인터페이스는 같은 파일 상단에 `NameProps`로 정의한다. 공용 타입은 `types/index.ts`에 둔다.
- 서버 통신과 비동기 상태는 컴포넌트가 아니라 훅에 둔다. 컴포넌트는 콜백 props만 받는다 (`ComponentCard.tsx:6-11`).
- UI 문구는 한국어, 클래스명은 영문 kebab-case(`btn-generate`, `tab--active`).

## Testing Strategy

- 설정: `src/test/setup.ts`가 jest-dom 매처 등록과 `afterEach` cleanup을 처리한다. 테스트 파일에서 중복 설정하지 않는다.
- 위치와 이름: 컴포넌트 옆 `Name.test.tsx`. 실행은 `bunx vitest run src/`.
- 패턴: `@testing-library/react` + `userEvent.setup()`, 쿼리는 `getByRole`로 접근 가능한 이름 기준 (`PromptInput.test.tsx:9`, `PromptInput.test.tsx:17`). 테스트 이름은 한국어 문장.
- 테스트 경계: `PromptInput`만 테스트가 있다. `useComponentGenerator`, `LivePreview`, `ComponentCard`, `App`은 테스트가 없으므로 변경 후 `bun run dev`로 직접 확인한다.

## Local Golden Rules

### Hard Constraints

- `LivePreview`는 `<LiveProvider code={code} noInline>`을 쓴다 (`components/LivePreview.tsx:14`). `noInline`을 제거하면 서버가 주입한 `render(<X />)` 호출 방식의 코드가 동작하지 않는다. 변경 시 `server/generator.ts`와 함께 수정한다.
- 미리보기 새로고침은 `LivePreview`의 `key`를 올려 리마운트하는 방식이다 (`ComponentCard.tsx:33`, `ComponentCard.tsx:74`). 애니메이션 컴포넌트를 다시 보여주는 기능이므로 `key` 제거 금지.

### Security Boundary

- 사용자가 입력한 API 키는 `usePersistentState`로 `localStorage`(`apiKey`)에 저장해 새로고침 후에도 유지하며 (`App.tsx`), 요청 body로만 보낸다 (`useComponentGenerator.ts`). `sessionStorage`/쿠키/URL에는 저장하지 않는다. Provider, 프롬프트 히스토리(최대 20개), 생성된 컴포넌트 목록도 같은 훅으로 저장한다.
- 서버 환경변수 키의 존재 여부는 boolean으로만 받는다 (`App.tsx:17-20`, `App.tsx:27`). 키 값을 요구하는 UI를 만들지 않는다.

### Asymmetry

- 키 검증은 두 곳에서 나뉜다. 입력과 .env 키가 모두 없으면 클라이언트가 `alert`로 먼저 막고 (`App.tsx:34-37`), 서버도 400으로 다시 막는다 (`server/index.ts:169-174`). 한쪽 메시지나 조건을 바꾸면 다른 쪽과 일치시킨다.
- 프로바이더를 바꾸면 입력된 키를 초기화한다 (`App.tsx:41-44`). 프로바이더별 키가 섞여 잘못된 서비스로 전송되는 것을 막는 동작이므로 유지한다.
- 재생성은 현재 선택된 `provider`/`apiKey`로 `handleGenerate`를 다시 호출한다 (`App.tsx:173`). 카드를 생성할 때의 프로바이더를 저장하지 않는다.
