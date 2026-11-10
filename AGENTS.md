# AGENTS.md

## Operational Commands

- 패키지 매니저는 `bun` 고정 (`bun.lock`). npm/yarn/pnpm 사용 금지.
- 설치: `bun install`
- 개발 (API 서버 + Vite 동시): `bun run dev`
- API 서버만: `bun run server` (`server/index.ts`, 포트 3002)
- 테스트: `bun run test` (vitest run). `bun test`(Bun 내장 러너)가 아니다. `vite.config.ts:14-19`가 `src/**`와 `server/**` 테스트를 함께 실행한다.
- 단일 테스트: `bunx vitest run server/generator.test.ts`
- 린트: `bun run lint`
- 빌드: `bun run build`. `tsc -b`는 `src/`와 `vite.config.ts`만 검사한다 (`tsconfig.app.json:30`, `tsconfig.node.json:24`). `server/`는 어떤 tsconfig에도 포함되지 않으므로 빌드가 서버 타입 오류를 잡지 못한다.
- 작업 완료 전 `bun run lint`, `bun run test`, `bun run build`를 통과시킨다.

## Golden Rules

### Immutable

- API 키를 응답·로그·코드에 노출하지 않는다. `/api/config`는 키 존재 여부(boolean)만 반환한다 (`server/index.ts:147-155`). `ENV_KEYS` 값 자체를 클라이언트로 내보내는 변경 금지.
- AI가 생성한 코드는 `react-live`로만 실행한다 (`src/components/LivePreview.tsx:14`). `eval`, `new Function`, `dangerouslySetInnerHTML` 등 다른 실행 경로를 추가하지 않는다.

### Hard Constraints (서버-클라이언트 경계)

- Vite 프록시 대상 포트와 서버 포트가 각각 하드코딩되어 있다: `vite.config.ts:11`, `server/index.ts:139` (3002). 한쪽만 바꾸면 `/api` 요청이 깨지므로 같이 수정한다.
- 서버가 반환하는 코드는 `react-live` `noInline` 모드에서 `render(<Component />)` 호출이 있어야 그려진다. 서버 후처리(`server/generator.ts`)와 클라이언트 렌더(`src/components/LivePreview.tsx`)가 이 계약으로 묶여 있으므로 한쪽을 바꾸면 다른 쪽도 확인한다.

## Context Map

- **[서버 수정 (Bun API, AI 프로바이더 호출, 코드 후처리)](./server/AGENTS.md)** — `server/` 하위 작업 시.
- **[프론트엔드 수정 (React 컴포넌트, 훅, 테스트 설정)](./src/AGENTS.md)** — `src/` 하위 작업 시.

## Project Context

- 목적: 프롬프트로 React 컴포넌트를 생성하고 미리보기/코드를 제공하는 도구.
- Stack: React 19, TypeScript, Vite, vitest, Bun(API 서버), react-live.
- 소개·설치·실행은 `README.md` 참고.

## Standards & References

- 커밋: `<type>: <한국어 요약>` (type: feat, fix, refactor, chore). 요약은 50자 안팎, 마침표 없음.
- 주석과 사용자 노출 메시지는 한국어로 작성한다 (기존 코드 기준).
- Maintenance Policy: 이 문서와 하위 `AGENTS.md`의 규칙이 코드와 괴리(라인 번호 포함)되면 업데이트를 제안한다.
