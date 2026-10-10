import { useId, useState, type ReactNode } from 'react';
import { HelpButton } from './HelpButton';

interface Props {
  title: string;
  helpId: string;
  children: ReactNode;
  /** Advanced controls, hidden until "More" is opened (PRD §2: simple by default). */
  more?: ReactNode;
  className?: string;
}

export function Section({ title, helpId, children, more, className }: Props) {
  const [open, setOpen] = useState(false);
  const moreId = useId();
  return (
    <section className={`section ${className ?? ''}`} aria-label={title} data-help-for={helpId}>
      <header className="section-head">
        <h2>{title}</h2>
        <HelpButton helpId={helpId} label={title} />
      </header>
      <div className="section-body">{children}</div>
      {more && (
        <>
          <button
            type="button"
            className="more-btn"
            aria-expanded={open}
            aria-controls={moreId}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Less' : 'More'}
          </button>
          <div id={moreId} className="section-body section-more" hidden={!open}>
            {more}
          </div>
        </>
      )}
    </section>
  );
}
