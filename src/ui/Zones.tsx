import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  id: string;
  children?: ReactNode;
  /** Composition can be collapsed to give the synth more room (PRD §2). */
  collapsible?: boolean;
}

export function Zone({ title, id, children, collapsible }: Props) {
  const [open, setOpen] = useState(true);
  return (
    <section className="zone" aria-labelledby={`${id}-title`} data-zone={id}>
      <header className="zone-head">
        <h2 id={`${id}-title`}>{title}</h2>
        {collapsible && (
          <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
            {open ? 'Collapse' : 'Expand'}
          </button>
        )}
      </header>
      <div id={`${id}-body`} className="zone-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
