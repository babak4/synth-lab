import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const AUDIO_GLOBS = ['src/audio/**', 'src/sequencer/**'];
const UI_GLOBS = ['src/ui/**'];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // AudioWorklet global scope.
    files: ['src/audio/worklets/**/*.worklet.js'],
    languageOptions: { globals: { AudioWorkletProcessor: 'readonly', registerProcessor: 'readonly', sampleRate: 'readonly' } },
  },
  {
    // Plan rule 1.2.5: UI code never touches Web Audio; the engine interface is the only bridge.
    files: UI_GLOBS,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/audio/*', '**/audio/**'], message: 'UI must use the SynthEngine interface, not audio internals.' }] }],
      'no-restricted-globals': ['error', 'AudioContext', 'OfflineAudioContext', 'AudioWorkletNode'],
    },
  },
  {
    // ...and audio code never imports UI.
    files: AUDIO_GLOBS,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/ui/*', '**/ui/**', 'react', 'react-dom'], message: 'Audio code must not import UI.' }] }],
    },
  },
);
