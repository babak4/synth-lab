# Piano roll editing (T5.3b): decisions

Where things live: rules in `src/core/piano-roll/` (snap, hit-test, overlap, edit-ops, gesture, edit-keys, describe), state and actions in `src/state/piano-roll-edit.ts` (tool, snap, length, selection, clipboard, cursor, drag preview, status text), one undo stack in `src/state/history-store.ts`, thin UI in `src/ui/composer/piano-roll/`.

## 1. Same-pitch overlap: trim, last edit wins

Two notes of one pitch never overlap. After any edit (add, draw, move, resize, paste, duplicate, nudge, transpose) the edited notes keep their size and the other notes give way:

- a note that starts before the edited note is cut short where the edited note starts (a tail beyond the edited note is dropped);
- a note that lies inside the edited note is removed;
- a note that starts inside the edited note and ends after it has its start moved to the edited note's end;
- edited notes that overlap each other (resizing two neighbours together) resolve the same way, the later start winning.

One function (`applyEdit` in `overlap.ts`) does this for every edit, so the policy cannot differ between them. Why trim and not prevent: a gesture is never silently refused halfway, the result is always a valid state, the live preview shows exactly what is committed, and one undo step restores every trimmed note (the undo step stores a diff of every note that changed).

## 2. Validity

Every edited note is normalised: pitch an integer 0–127, velocity an integer 1–127, start ≥ 0, duration ≥ 1 tick, and the note ends no later than the song length. A note that would start at or after the end is refused (a click past the end announces it). Notes the user does not touch are never altered, even if an older project has notes past the end; for the notes being edited the limit grows to their current end, so editing never drags a note back onto the song. Group moves, transposes and nudges are clamped as a group, so the notes keep their relative shape against the edges. Resizing never shrinks a note below one snap step (one tick with snap off), and a note already shorter than that cannot shrink further.

## 3. Undo: one stack, tagged by track

`createHistoryStore` now edits the project document (`History<Project>`), not just the patch. Sound edits are recorded by watching the project for tracks whose patch changed (the patch editor already writes into the selected track's patch); note edits are executed through `history.execute` by the piano roll's edit store. So Cmd/Ctrl+Z and the top-bar buttons undo sound and note edits in the order they happened, with labels such as "Undo: Move 3 notes".

- Gesture = one step. A drag (move, resize, draw, box) changes nothing in the project until the pointer is released; the canvas draws a preview. Release commits one step; Escape cancels. Held-key repeats (arrow transpose or nudge) coalesce into one step per key press, because the existing `keyup` handler ends the gesture.
- Track switching no longer clears history. Every command names its track (`target`): patch commands replace that track's patch, note commands add and remove notes by id on that track. Undoing a step selects its track (`onApply`), so the change is visible. Coalescing keys include the track id.
- History ends when the whole project is replaced (open, new project, restore: `loadGeneration` changes). Removing a track drops only that track's steps (`History.removeWhere`, in both the undo and redo stacks, order kept); other tracks' steps keep working.
- Note steps are diffs by note id, not snapshots of the notes array, so a note added by something else in between (the recorder, T5.5) is not lost by an undo.
- Note steps restore old neighbours by id (`applyDiff`). The T5.5 recorder must therefore route its note writes through `history.execute` (or re-run overlap resolution on undo), or an undo could bring back a note that overlaps something recorded in between.
- "Try this" A/B and Undo hold patches of one track; selecting another track ends the experiment (the change itself stays undoable through the app's undo).
- `createHistoryStore(patchStore, { projectStore })` is the real wiring; called with only a patch store (the old unit tests) it keeps a private project bound to that patch store.

## 4. Keyboard model (grid focused)

| State | Keys |
| --- | --- |
| Notes selected | Up/Down transpose ±1 (Shift ±12); Left/Right nudge by the snap step (Shift: a beat); Delete/Backspace delete; Ctrl/Cmd+D duplicate; Ctrl/Cmd+C/X/V copy/cut/paste at the playhead |
| No selection, keyboard entry on | Up/Down move the cursor a pitch (Shift: octave); Left/Right a snap step (Shift: a beat); Enter adds a note at the cursor and steps the cursor to its end, or selects/deselects the note under it; Delete removes the note under it; Escape leaves keyboard entry |
| Neither | Arrow keys scroll the view as before; Enter starts keyboard entry (places the cursor at the playhead) |
| Always | Ctrl/Cmd+A select all; Escape deselects |

Every outcome is written to a visually hidden `role="status"` (polite) region that re-announces identical consecutive messages (a zero-width space is toggled on each message) ("Added D4 quarter note at bar 1, beat 2", "Moved 3 notes", "Already at the highest pitch"). The grid keeps its accessible name; `aria-describedby` lists the keys.

## Pointer model

Draw tool (default): click empty grid to add a note of the current length in the clicked cell; drag to draw a length (end snaps, minimum one step); Shift-drag on empty grid is a box select. Select tool: drag on empty grid is a box select, click clears. In both: click selects, Shift-click toggles, drag a note to move, drag its right edge (about 8 px, shrinking to a third of a narrow note, with 3 px tolerance) to resize. Alt bypasses snap for the gesture. Shift does not engage the laptop keyboard's sustain pedal while the grid is focused (`data-no-shift-sustain`), so audition notes end by themselves. A move with no button down ends a gesture whose pointer-up was lost; only the primary button (not a pen eraser or barrel button) starts an edit; a wheel scroll or zoom during a drag refreshes the preview from the last pointer position. Snap start of a move lands the grabbed note's start on the grid (others keep their distance); a resize lands the grabbed note's end on the grid. Snap steps count from tick 0.

Audition: a note placed and a pitch changed (drag, transpose, cursor) plays briefly through the same route as the piano column (`source: "audition"`).

The paste position is the playhead exactly (not snapped). The clipboard lives in the edit store and survives track switches.
