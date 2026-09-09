import { useLayoutEffect, useRef } from 'react';

/** Stable event/IO access to the last committed render, including async responses. */
export function useLatest<T>(value: T) {
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  return latest;
}
