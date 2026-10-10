import { useEffect, useState } from 'react';
import { defaultLabel } from '@/core/keyboard';

interface KeyboardLayoutMap {
  get(code: string): string | undefined;
}

/**
 * Key-cap labels for the user's real keyboard. Chromium can report what each physical key types
 * (so an AZERTY user sees "A" where we map the QWERTY "Q" position); elsewhere we fall back to US caps.
 */
export function useLayoutLabels(): (code: string) => string {
  const [map, setMap] = useState<KeyboardLayoutMap | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<KeyboardLayoutMap> } };
    let live = true;
    nav.keyboard?.getLayoutMap?.().then((m) => live && setMap(m), () => {});
    return () => {
      live = false;
    };
  }, []);
  return (code) => {
    const typed = map?.get(code);
    return typed && typed.length === 1 ? typed.toUpperCase() : defaultLabel(code);
  };
}
