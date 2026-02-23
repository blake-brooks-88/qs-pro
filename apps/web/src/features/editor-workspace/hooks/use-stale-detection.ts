import { useCallback, useRef } from "react";

interface StaleDetectionState {
  openedHash: string | null;
  trackOpened: (hash: string) => void;
  updateHash: (newHash: string) => void;
  clearHash: () => void;
}

export function useStaleDetection(): StaleDetectionState {
  const hashRef = useRef<string | null>(null);

  const trackOpened = useCallback((hash: string) => {
    hashRef.current = hash;
  }, []);

  const updateHash = useCallback((newHash: string) => {
    hashRef.current = newHash;
  }, []);

  const clearHash = useCallback(() => {
    hashRef.current = null;
  }, []);

  return {
    openedHash: hashRef.current,
    trackOpened,
    updateHash,
    clearHash,
  };
}
