/**
 * Golden-render assertions (plan T1.8). Browser-side: reads/writes tests/golden/*.json through
 * Vitest browser commands. Regenerate with `npm run golden:update` after an intentional sound change
 * and review the diff.
 */
import { commands } from 'vitest/browser';
import { compareFingerprints, type Fingerprint, type Tolerance, DEFAULT_TOLERANCE } from './fingerprint';

declare module 'vitest/browser' {
  interface BrowserCommands {
    readGolden(name: string): Promise<string | null>;
    writeGolden(name: string, json: string): Promise<boolean>;
  }
}

/** Throws with a readable message if `actual` drifts from the stored fingerprint `name`. */
export async function expectGolden(name: string, actual: Fingerprint, tol: Tolerance = DEFAULT_TOLERANCE): Promise<void> {
  if (await commands.writeGolden(name, JSON.stringify(actual, null, 2))) return; // UPDATE_GOLDEN=1 run
  const stored = await commands.readGolden(name);
  if (stored === null) throw new Error(`No golden render "${name}". Create it with: npm run golden:update`);
  const problems = compareFingerprints(actual, JSON.parse(stored) as Fingerprint, tol);
  if (problems.length) throw new Error(`Golden render "${name}" changed:\n  - ${problems.join('\n  - ')}\nIf intentional: npm run golden:update`);
}
