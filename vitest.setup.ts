import '@testing-library/jest-dom/vitest';

// jsdom has no canvas. Components skip drawing when getContext() is null; canvas output is covered by
// the Playwright specs, so keep unit-test output free of "not implemented" noise.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
