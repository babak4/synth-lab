import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const GOLDEN_DIR = resolve(fileURLToPath(new URL('./tests/golden', import.meta.url)));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
          exclude: ['src/**/*.audio.test.ts'],
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        // Real Web Audio (OfflineAudioContext + AudioWorklet) in headless Chromium.
        extends: true,
        test: {
          name: 'audio',
          include: ['src/**/*.audio.test.ts'],
          testTimeout: 30_000,
          browser: {
            enabled: true,
            headless: true,
            // Browser tests cannot touch the file system, so golden files go through the Node side.
            commands: {
              readGolden: (_ctx: unknown, name: string): string | null => {
                const file = resolve(GOLDEN_DIR, `${name}.json`);
                return existsSync(file) ? readFileSync(file, 'utf8') : null;
              },
              writeGolden: (_ctx: unknown, name: string, json: string): boolean => {
                if (!process.env.UPDATE_GOLDEN) return false;
                const file = resolve(GOLDEN_DIR, `${name}.json`);
                mkdirSync(dirname(file), { recursive: true });
                writeFileSync(file, json + '\n');
                return true;
              },
            },
            provider: playwright({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
