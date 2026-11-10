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

/**
 * 응답 본문에서 SSE data 값을 순서대로 꺼낸다.
 * 소비자가 중간에 멈추거나 에러가 나면 업스트림 읽기를 취소해 연결이 남지 않게 한다.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseData(buffer);
      buffer = parsed.rest;
      yield* parsed.data;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Anthropic 스트림 이벤트에서 텍스트 델타를 꺼낸다. 텍스트 이벤트가 아니면 빈 문자열. */
export function extractAnthropicDelta(data: string): string {
  const event = JSON.parse(data) as {
    type?: string;
    delta?: { type?: string; text?: string };
  };
  // 스트림 중 에러를 무시하면 잘린 코드가 정상 완료로 저장된다. 원문은 노출하지 않는다.
  if (event.type === 'error') {
    throw new Error('Claude 응답 생성 중 오류가 발생했습니다.');
  }
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? '';
  }
  return '';
}

/** Gemini 스트림 청크에서 텍스트와 MAX_TOKENS 잘림 여부를 꺼낸다. */
export function extractGoogleDelta(data: string): { text: string; truncated: boolean } {
  const chunk = JSON.parse(data) as {
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  if (chunk.promptFeedback?.blockReason) {
    throw new Error(`요청이 차단되었습니다. (사유: ${chunk.promptFeedback.blockReason})`);
  }

  const candidate = chunk.candidates?.[0];
  const reason = candidate?.finishReason;
  // STOP과 MAX_TOKENS(호출 측에서 별도 처리) 외의 종료 사유는 불완전한 응답이다.
  if (reason && reason !== 'STOP' && reason !== 'MAX_TOKENS') {
    throw new Error(`생성이 중단되었습니다. (사유: ${reason})`);
  }
  return {
    text: candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
    truncated: candidate?.finishReason === 'MAX_TOKENS',
  };
}
