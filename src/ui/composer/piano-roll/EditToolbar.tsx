import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import { DIVISIONS, SNAP_OPTIONS, divisionName, lengthTicks, snapFromId, snapId, type Division } from '@/core/piano-roll';

const SHORT: Record<Division, string> = { 1: '1/1', 2: '1/2', 4: '1/4', 8: '1/8', 16: '1/16', 32: '1/32' };

/** Tool, grid snap and note-length controls for the piano roll (plan T5.3b). Selection and clipboard keys live on the grid. */
export function EditToolbar() {
  const { pianoRollEdit } = useServices();
  const tool = useStore(pianoRollEdit, (s) => s.tool);
  const snap = useStore(pianoRollEdit, (s) => s.snap);
  const length = useStore(pianoRollEdit, (s) => s.length);
  const selected = useStore(pianoRollEdit, (s) => s.selection.length);
  const edit = pianoRollEdit.getState;

  return (
    <div className="pr-toolbar" role="toolbar" aria-label="Piano roll editing">
      <span className="pr-group" role="group" aria-label="Tool">
        <button type="button" aria-pressed={tool === 'draw'} title="Draw: click to add a note, drag to draw its length" onClick={() => edit().setTool('draw')}>
          Draw
        </button>
        <button type="button" aria-pressed={tool === 'select'} title="Select: drag on empty space to select with a box" onClick={() => edit().setTool('select')}>
          Select
        </button>
      </span>
      <label className="pr-field">
        <span>Snap</span>
        <select
          value={snapId(snap)}
          onChange={(e) => {
            const next = snapFromId(e.target.value);
            if (next) edit().setSnap(next);
          }}
          title="Grid snap. Hold Alt while dragging to bypass it."
        >
          {SNAP_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <span className="pr-group" role="group" aria-label="Note length">
        {DIVISIONS.map((d) => (
          <button
            key={d}
            type="button"
            aria-label={`${divisionName(d)[0]!.toUpperCase()}${divisionName(d).slice(1)} note (${SHORT[d]})`}
            aria-pressed={length.division === d}
            title={`${divisionName(d)} note (${lengthTicks({ division: d, dotted: length.dotted, triplet: length.triplet })} ticks)`}
            onClick={() => edit().setLength({ division: d })}
          >
            {SHORT[d]}
          </button>
        ))}
        <button type="button" aria-pressed={length.dotted} title="Dotted: one and a half times as long" onClick={() => edit().setLength({ dotted: !length.dotted })}>
          Dotted
        </button>
        <button type="button" aria-pressed={length.triplet} title="Triplet: two thirds as long" onClick={() => edit().setLength({ triplet: !length.triplet })}>
          Triplet
        </button>
      </span>
      <span className="pr-count" aria-hidden="true">
        {selected > 0 ? `${selected} selected` : ''}
      </span>
    </div>
  );
}
