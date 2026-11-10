// TDD 리마인더 훅: 코드 파일을 생성·수정하기 전에 .claude/rules/tdd.md 요약을 컨텍스트로 주입한다.
const input = await Bun.stdin.json();
const filePath: string = input?.tool_input?.file_path ?? "";

// TDD 적용 대상(코드 파일)만 리마인드한다. 문서·설정 파일은 건너뛴다.
if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) process.exit(0);

const isTest = /\.test\.[jt]sx?$/.test(filePath);

const reminder = [
  "[TDD 리마인더] .claude/rules/tdd.md 규칙은 Rigid다. 단계를 건너뛰거나 순서를 바꾸지 마라.",
  isTest
    ? "- 지금은 RED 단계다: 하나의 동작 = 하나의 테스트. 작성 후 반드시 실행해서 '기능 미구현' 사유로 실패하는지 확인하라 (문법·import 오류는 RED가 아니다)."
    : "- 이 프로덕션 코드를 수정하기 전에, 이 동작을 검증하는 실패 테스트를 먼저 작성하고 실행해서 RED를 확인했는가? 아니라면 지금 쓰려는 코드를 중단하고 테스트부터 작성하라.",
  "- GREEN: 테스트를 통과시키는 최소한의 코드만 작성한다 (YAGNI). 신규·기존 테스트 모두 실행해 확인한다.",
  "- REFACTOR: 새 동작 추가 금지. 매 변경 후 테스트를 실행해 green을 유지한다.",
  "- 테스트보다 프로덕션 코드를 먼저 썼다면 그 코드를 삭제하고 RED부터 다시 시작한다 (주석 처리·보관 금지).",
  "- 버그 수정은 재현 테스트를 먼저 작성한다.",
].join("\n");

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: reminder,
    },
  }),
);
