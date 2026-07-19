import { useCallback, useEffect, useState } from "react";

/** Persisted state backed by localStorage, JSON-serialised. */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [key, value]);

  const set = useCallback((v: T) => setValue(v), []);
  return [value, set];
}
