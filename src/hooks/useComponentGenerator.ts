import { useState, useCallback } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { usePersistentState } from './usePersistentState';
import { parseNdjson } from '../utils/parseNdjson';

interface StreamingState {
  prompt: string;
  code: string;
}

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  streaming: StreamingState | null;
  error: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = usePersistentState<GeneratedComponent[]>(
    'generatedComponents',
    [],
    (raw) =>
      Array.isArray(raw)
        ? raw.map((c) => ({ ...c, createdAt: new Date(c.createdAt) }))
        : [],
  );
  const [isLoading, setIsLoading] = useState(false);
  // 생성 중인 코드는 저장하지 않는다. 완료되면 components에 추가된다.
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);
    setStreaming({ prompt, code: '' });

    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalCode: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const parsed = parseNdjson(buffer + decoder.decode(value, { stream: true }));
        buffer = parsed.rest;

        for (const event of parsed.events as StreamEvent[]) {
          if (event.type === 'delta') {
            setStreaming((prev) => prev && { ...prev, code: prev.code + event.text });
          } else if (event.type === 'done') {
            finalCode = event.code;
          } else {
            throw new Error(event.error);
          }
        }
      }

      if (finalCode === null) {
        throw new Error('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: finalCode,
        createdAt: new Date(),
      };

      setComponents((prev) => [newComponent, ...prev]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setStreaming(null);
      setIsLoading(false);
    }
  }, [setComponents]);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, [setComponents]);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, [setComponents]);

  return { components, isLoading, streaming, error, generate, removeComponent, clearAll };
}
