import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import { hasUnsavedChanges, PROJECT_NAME_MAX } from '@/state/project-file-store';
import type { SaveStatus } from '@/state/persistence';
import './ProjectMenu.css';

/** Download text as a file (a UI concern, so it lives here rather than in the store). */
function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save',
};

/**
 * Project button (plan T5.7): a popover with New, Open file…, Save file… and the project name. Autosave
 * status is always visible next to the button, so the top bar only ever shows one extra control.
 */
export function ProjectMenu() {
  const { projectStore, projectFileStore, persistence } = useServices();
  const project = useStore(projectStore, (s) => s.project);
  const file = useStore(projectFileStore);
  const persist = useStore(persistence.store);
  const [open, setOpen] = useState(false);
  const [confirmingNew, setConfirmingNew] = useState(false);
  /** The name as typed; an empty name is not committed, and reverts to the saved name on blur. */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const unsaved = hasUnsavedChanges(project, file.baseline);

  /** Close and hand focus back to the button (the popover's own close, Escape, or a click elsewhere). */
  const close = (returnFocus: boolean) => {
    setOpen(false);
    setConfirmingNew(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  // While open: a click outside closes it, and Escape closes it wherever focus is. Escape is taken at the
  // document and does not propagate, so the keyboard player's global Escape does not also fire.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const newProject = () => {
    if (unsaved && !confirmingNew) {
      setConfirmingNew(true);
      return;
    }
    setConfirmingNew(false);
    projectFileStore.getState().newProject();
  };

  const saveFile = () => {
    const { filename, text } = projectFileStore.getState().saveToFile();
    download(filename, text);
  };

  return (
    <div className="project-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        Project
      </button>
      <span className={`autosave ${persist.status}`} role="status" aria-live="polite" data-testid="autosave-status">
        {STATUS_TEXT[persist.status]}
      </span>
      {persist.notice && (
        <span className="project-notice" role="alert" title={persist.notice}>
          <span className="project-notice-text">{persist.notice}</span>
          <button type="button" className="notice-dismiss" aria-label="Dismiss project notice" onClick={() => persist.dismissNotice()}>
            ×
          </button>
        </span>
      )}

      {open && (
        <div id={panelId} role="dialog" aria-label="Project" className="project-panel">
          <div className="project-field">
            <label htmlFor={`${panelId}-name`}>Project name</label>
            <input
              id={`${panelId}-name`}
              value={nameDraft ?? project.name}
              maxLength={PROJECT_NAME_MAX}
              onChange={(e) => {
                setNameDraft(e.target.value);
                if (e.target.value.trim()) projectFileStore.getState().rename(e.target.value);
              }}
              onBlur={() => setNameDraft(null)}
            />
          </div>
          <p className="project-unsaved" data-testid="unsaved-state">
            {unsaved ? 'Changes not saved to a file' : 'No unsaved changes to a file'}
          </p>

          <div className="project-actions">
            <button type="button" onClick={newProject}>
              New project
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              Open file…
            </button>
            <button type="button" onClick={saveFile}>
              Save file…
            </button>
          </div>

          {confirmingNew && (
            <div className="project-confirm" role="group" aria-label="Confirm new project">
              <span>Discard the changes that are not saved to a file?</span>
              <button type="button" onClick={newProject}>
                Start new project
              </button>
              <button type="button" onClick={() => setConfirmingNew(false)}>
                Cancel
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".json,.synthlab.json,application/json"
            className="visually-hidden"
            aria-label="Open a project file"
            tabIndex={-1}
            onChange={async (e) => {
              const picked = e.target.files?.[0];
              e.target.value = '';
              if (picked) projectFileStore.getState().openText(await picked.text());
            }}
          />
          <p className={`project-message ${file.message?.kind ?? ''}`} role={file.message?.kind === 'error' ? 'alert' : 'status'}>
            {file.message?.text ?? ''}
          </p>
          <button type="button" className="project-close" onClick={() => close(true)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
