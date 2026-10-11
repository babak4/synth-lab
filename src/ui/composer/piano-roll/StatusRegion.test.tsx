// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '@/app/context';
import { createMockServices } from '@/app/mock-services';
import { StatusRegion } from './StatusRegion';

afterEach(cleanup);

describe('piano roll status region', () => {
  it('is a polite live region', () => {
    render(
      <ServicesContext.Provider value={createMockServices()}>
        <StatusRegion />
      </ServicesContext.Provider>,
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('changes its text even when the same message is announced twice in a row', () => {
    const s = createMockServices();
    render(
      <ServicesContext.Provider value={s}>
        <StatusRegion />
      </ServicesContext.Provider>,
    );
    const region = screen.getByRole('status');
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      act(() => s.pianoRollEdit.getState().announce('Already at the highest pitch'));
      seen.push(region.textContent ?? '');
    }
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[1]).not.toBe(seen[2]);
    // Assistive technology reads the same words each time.
    expect(seen.map((t) => t.replace('​', ''))).toEqual(Array(3).fill('Already at the highest pitch'));
  });
});
