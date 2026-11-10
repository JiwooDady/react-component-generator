// 커밋 전 보호 훅: `git commit` 실행 전에 전체 테스트를 돌리고, 실패하면 커밋을 차단한다.
const input = await Bun.stdin.json();
const command: string = input?.tool_input?.command ?? "";

// `git commit`, `git -C x commit` 등 커밋 명령만 대상으로 한다.
if (!/\bgit\s+(?:-\S+\s+(?:\S+\s+)?)*commit\b/.test(command)) process.exit(0);

const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const result = Bun.spawnSync(["bun", "run", "test"], { cwd, stdout: "pipe", stderr: "pipe" });

if (result.exitCode !== 0) {
  const output = `${result.stdout.toString()}\n${result.stderr.toString()}`.trim();
  console.error(`테스트가 실패하여 커밋을 차단했습니다. 테스트를 모두 통과시킨 뒤 다시 커밋하세요.\n\n${output.slice(-3000)}`);
  process.exit(2);
}
process.exit(0);
