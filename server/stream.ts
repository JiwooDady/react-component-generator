// 스트리밍 응답(SSE) 파싱용 순수 함수들.
// 부수효과가 없어 단위 테스트가 가능하다.

/** SSE 버퍼에서 완성된 이벤트의 data 값을 추출하고, 덜 받은 나머지는 rest로 돌려준다. */
export function parseSseData(buffer: string): { data: string[]; rest: string } {
  const events = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = events.pop() ?? '';
  const data: string[] = [];

  for (const event of events) {
    const lines = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (lines.length > 0) data.push(lines.join('\n'));
  }

  return { data, rest };
}

/** Anthropic 스트림 이벤트에서 텍스트 델타를 꺼낸다. 텍스트 이벤트가 아니면 빈 문자열. */
export function extractAnthropicDelta(data: string): string {
  const event = JSON.parse(data) as {
    type?: string;
    delta?: { type?: string; text?: string };
  };
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? '';
  }
  return '';
}

/** Gemini 스트림 청크에서 텍스트와 MAX_TOKENS 잘림 여부를 꺼낸다. */
export function extractGoogleDelta(data: string): { text: string; truncated: boolean } {
  const chunk = JSON.parse(data) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  const candidate = chunk.candidates?.[0];
  return {
    text: candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
    truncated: candidate?.finishReason === 'MAX_TOKENS',
  };
}
