import { describe, it, expect } from 'vitest';
import { parseNdjson } from './parseNdjson';

describe('parseNdjson', () => {
  it('완성된 줄을 JSON 객체로 파싱한다', () => {
    const { events, rest } = parseNdjson('{"type":"delta","text":"a"}\n{"type":"done"}\n');
    expect(events).toEqual([{ type: 'delta', text: 'a' }, { type: 'done' }]);
    expect(rest).toBe('');
  });

  it('개행으로 끝나지 않은 마지막 줄은 rest로 남긴다', () => {
    const { events, rest } = parseNdjson('{"type":"delta"}\n{"type":"do');
    expect(events).toEqual([{ type: 'delta' }]);
    expect(rest).toBe('{"type":"do');
  });

  it('빈 줄은 무시한다', () => {
    const { events } = parseNdjson('\n{"a":1}\n\n');
    expect(events).toEqual([{ a: 1 }]);
  });
});
