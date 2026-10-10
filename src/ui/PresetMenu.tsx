import { useRef, useState, type FormEvent } from 'react';
import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import { isEdited } from '@/state/preset-store';
import { HelpButton } from './components';

/** Download text as a file. Kept here because it is a UI concern (DOM), not a store concern. */
function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PresetMenu() {
  const { presetStore, patchStore } = useServices();
  const preset = useStore(presetStore);
  const params = useStore(patchStore, (s) => s.patch.params);
  const [naming, setNaming] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = [...preset.factory, ...preset.user].find((p) => p.id === preset.currentId);
  const edited = isEdited(preset, params);
  const isUser = preset.user.some((p) => p.id === preset.currentId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (naming === null) return;
    if (await preset.saveAs(naming)) setNaming(null);
  };

  return (
    <div className="preset-menu" role="group" aria-label="Presets">
      <label htmlFor="preset-select">Preset</label>
      <select id="preset-select" value={preset.currentId ?? ''} onChange={(e) => preset.select(e.target.value)}>
        {!current && (
          <option value="" disabled>
            Custom
          </option>
        )}
        <optgroup label="Factory">
          {preset.factory.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
        {preset.user.length > 0 && (
          <optgroup label="Yours">
            {preset.user.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {edited && <span className="preset-edited" title="You have changed this sound since loading the preset">edited</span>}
      {current?.description && <HelpButton helpId={current.teaches ?? 'oscillators'} label={`Preset ${current.name}`} />}

      <button type="button" onClick={() => preset.restore()} disabled={!edited || !preset.currentId} title="Put the preset back as it was">
        Restore
      </button>
      <button type="button" onClick={() => setNaming(current && isUser ? current.name : `${current?.name ?? 'My sound'} copy`)}>
        Save as…
      </button>
      <button type="button" disabled={!preset.currentId} onClick={() => preset.currentId && download(`${current?.name ?? 'preset'}.json`, preset.exportJson(preset.currentId) ?? '')}>
        Export
      </button>
      <button type="button" onClick={() => fileRef.current?.click()}>
        Import…
      </button>
      {isUser && (
        <button type="button" onClick={() => preset.currentId && void preset.remove(preset.currentId)}>
          Delete
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        aria-label="Import a preset file"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) await preset.importJson(await file.text());
        }}
      />

      {naming !== null && (
        <form className="preset-name" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}>
          <label htmlFor="preset-name-input">Name</label>
          <input id="preset-name-input" autoFocus value={naming} maxLength={64} onChange={(e) => setNaming(e.target.value)} />
          <button type="submit">Save</button>
          <button type="button" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </form>
      )}
      <span className={`preset-message ${preset.message?.kind ?? ''}`} role={preset.message?.kind === 'error' ? 'alert' : 'status'}>
        {preset.message?.text ?? ''}
      </span>
    </div>
  );
}
