import { describe, it, expect } from 'vitest';
import { parseSseData, extractAnthropicDelta, extractGoogleDelta } from './stream';

describe('parseSseData', () => {
  it('완성된 이벤트의 data 값을 추출한다', () => {
    const { data, rest } = parseSseData('data: {"a":1}\n\ndata: {"a":2}\n\n');
    expect(data).toEqual(['{"a":1}', '{"a":2}']);
    expect(rest).toBe('');
  });

  it('끝나지 않은 이벤트는 rest로 남긴다', () => {
    const { data, rest } = parseSseData('data: {"a":1}\n\ndata: {"a"');
    expect(data).toEqual(['{"a":1}']);
    expect(rest).toBe('data: {"a"');
  });

  it('CRLF 구분자도 처리한다', () => {
    const { data } = parseSseData('event: x\r\ndata: hello\r\n\r\n');
    expect(data).toEqual(['hello']);
  });
});

describe('extractAnthropicDelta', () => {
  it('content_block_delta의 텍스트를 반환한다', () => {
    const payload = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'const A' },
    });
    expect(extractAnthropicDelta(payload)).toBe('const A');
  });

  it('텍스트 델타가 아닌 이벤트는 빈 문자열을 반환한다', () => {
    expect(extractAnthropicDelta(JSON.stringify({ type: 'message_start' }))).toBe('');
  });
});

describe('extractGoogleDelta', () => {
  it('candidates의 parts 텍스트를 이어 붙여 반환한다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'foo' }, { text: 'bar' }] } }],
    });
    expect(extractGoogleDelta(payload)).toEqual({ text: 'foobar', truncated: false });
  });

  it('finishReason이 MAX_TOKENS면 truncated를 true로 표시한다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'MAX_TOKENS' }],
    });
    expect(extractGoogleDelta(payload).truncated).toBe(true);
  });
});
