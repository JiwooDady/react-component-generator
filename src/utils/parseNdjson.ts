// 스트리밍 응답(줄 단위 JSON)을 파싱하는 순수 함수.
// 개행으로 끝나지 않은 마지막 조각은 rest로 돌려줘 다음 청크와 이어 붙일 수 있게 한다.

export function parseNdjson(buffer: string): { events: unknown[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events = lines.filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as unknown);
  return { events, rest };
}
