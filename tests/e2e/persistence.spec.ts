import { test, expect, type Page } from '@playwright/test';
import { showTab } from './tabs';

type Project = { name: string; tempo: number; tracks: { id: string; patch: { params: Record<string, unknown> } }[] };
type Synth = {
  projectStore: { getState(): { project: Project; selectedTrackId: string; addTrack(): void; setTempo(n: number): void } };
  patchStore: { getState(): { patch: { params: Record<string, unknown> } } };
};

/** Run a function in the page against the test hook, e.g. `run(page, (s) => s.projectStore.getState().project)`. */
const run = <T>(page: Page, fn: (s: Synth) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__synth)`) as Promise<T>;
const project = (page: Page) => run(page, (s) => s.projectStore.getState().project);

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForSelector('[data-testid=synth-panel]');
  await showTab(page, 'Shape');
}

const cutoff = (page: Page) => page.getByRole('slider', { name: 'Cutoff' });
const projectButton = (page: Page) => page.getByRole('button', { name: 'Project', exact: true });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Project' });

/** Wait until the autosave has written the latest change. */
const savedNow = (page: Page) => expect(page.getByTestId('autosave-status')).toHaveText('Saved');

test('an edited knob and an added track are still there after a reload', async ({ page }) => {
  await ready(page);
  await cutoff(page).focus();
  await page.keyboard.press('Home'); // cutoff → 20 Hz
  await run(page, (s) => s.projectStore.getState().addTrack());
  await run(page, (s) => s.projectStore.getState().setTempo(97));
  await savedNow(page);
  const before = await project(page);
  expect(before.tracks).toHaveLength(2);

  await page.reload();
  await page.waitForSelector('[data-testid=synth-panel]');
  const after = await project(page);
  expect(after).toEqual(before);
  expect(after.tempo).toBe(97);
  await showTab(page, 'Shape');
  await expect(cutoff(page)).toHaveAttribute('aria-valuenow', '20');
});

test('corrupt saved data falls back to a fresh project with a visible message, and keeps a backup', async ({ page }) => {
  await ready(page);
  await run(page, (s) => s.projectStore.getState().setTempo(111));
  await savedNow(page);

  // Damage the stored copy the way an old or hand-edited file might look.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open('synth-lab');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ schemaVersion: 1, name: 42, tracks: 'nope' }, 'project:current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await page.reload();
  await page.waitForSelector('[data-testid=synth-panel]');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Your saved project could not be read');
  await expect(alert).toContainText('kept as a backup');
  expect((await project(page)).tempo).toBe(120); // fresh project
  // The notice is also in the menu's reach, and the damaged copy survives as a backup.
  const backupExists = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open('synth-lab');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction('kv').objectStore('kv').get('project:backup');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value !== undefined;
  });
  expect(backupExists).toBe(true);
  await alert.getByRole('button', { name: 'Dismiss project notice' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('save to a file, then open it again after New project: the project round-trips', async ({ page }) => {
  await ready(page);
  await projectButton(page).click();
  await panel(page).getByLabel('Project name').fill('Round trip');
  await run(page, (s) => s.projectStore.getState().addTrack());
  await run(page, (s) => s.projectStore.getState().setTempo(88));
  const expected = await project(page);

  const downloadPromise = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'Save file…' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('round-trip.synthlab.json');
  const path = (await download.path())!;

  // Start over (no confirmation: everything is saved to a file), then open the file.
  await panel(page).getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('group', { name: 'Confirm new project' })).toHaveCount(0);
  expect((await project(page)).name).toBe('Untitled');

  await panel(page).getByLabel('Open a project file').setInputFiles(path);
  await expect(panel(page).getByRole('status').filter({ hasText: 'Opened “Round trip”.' })).toBeVisible();
  expect(await project(page)).toEqual(expected);
});

test('importing an invalid file shows a clear error and changes nothing', async ({ page }) => {
  await ready(page);
  await projectButton(page).click();
  await panel(page).getByLabel('Project name').fill('Keep me');
  await panel(page).getByLabel('Open a project file').setInputFiles({
    name: 'broken.synthlab.json',
    mimeType: 'application/json',
    // Everything valid except the tempo, so the error names exactly that field.
    buffer: Buffer.from(
      JSON.stringify({
        format: 'synth-lab-project',
        schemaVersion: 1,
        project: {
          schemaVersion: 1,
          name: 'X',
          tempo: 9999,
          timeSignature: { numerator: 4, denominator: 4 },
          lengthBars: 8,
          loop: { enabled: true, startBar: 0, endBar: 8 },
          tracks: [],
        },
      }),
    ),
  });
  await expect(panel(page).getByRole('alert')).toContainText('Could not open this file: tempo: must be at most 240');
  await expect(panel(page).getByRole('alert')).toContainText('Nothing was changed.');
  expect((await project(page)).name).toBe('Keep me');
  expect((await project(page)).tempo).toBe(120);
});

test('importing a file that is not JSON, or not a project, is refused', async ({ page }) => {
  await ready(page);
  await projectButton(page).click();
  await panel(page).getByLabel('Open a project file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(panel(page).getByRole('alert')).toContainText('not valid JSON');
  await panel(page).getByLabel('Open a project file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(panel(page).getByRole('alert')).toContainText('this is not a Synth Lab project file');
});

test('New project asks before discarding changes that are not saved to a file', async ({ page }) => {
  await ready(page);
  await run(page, (s) => s.projectStore.getState().setTempo(101));
  await projectButton(page).click();
  await panel(page).getByRole('button', { name: 'New project' }).click();
  const confirm = page.getByRole('group', { name: 'Confirm new project' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  expect((await project(page)).tempo).toBe(101);

  await panel(page).getByRole('button', { name: 'New project' }).click();
  await page.getByRole('button', { name: 'Start new project' }).click();
  expect((await project(page)).tempo).toBe(120);
});

test('the Project popover closes on Escape and returns focus to its button', async ({ page }) => {
  await ready(page);
  await projectButton(page).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(projectButton(page)).toBeFocused();
});
