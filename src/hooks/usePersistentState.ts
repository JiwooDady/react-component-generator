import { useState, useEffect } from 'react';

function load<T>(key: string, initial: T, revive?: (raw: unknown) => T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return initial;
    const parsed: unknown = JSON.parse(stored);
    return revive ? revive(parsed) : (parsed as T);
  } catch {
    return initial;
  }
}

export function usePersistentState<T>(key: string, initial: T, revive?: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => load(key, initial, revive));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 저장 공간 부족 등은 무시하고 메모리 상태만 유지한다
    }
  }, [key, value]);

  return [value, setValue] as const;
}
