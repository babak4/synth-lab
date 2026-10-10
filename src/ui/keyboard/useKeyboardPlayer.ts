import { useEffect } from 'react';
import { useServices } from '@/app/context';
import { KeyboardPlayer } from './keyboard-player';

/** Attach the laptop-keyboard player for the lifetime of the app. */
export function useKeyboardPlayer(): void {
  const { bus, appStore, host, startAudio } = useServices();
  useEffect(() => {
    const player = new KeyboardPlayer({
      bus,
      appStore,
      now: () => host.currentTime,
      onFirstGesture: () => {
        if (appStore.getState().audio === 'off') void startAudio();
      },
    });
    return player.attach(window);
  }, [bus, appStore, host, startAudio]);
}
