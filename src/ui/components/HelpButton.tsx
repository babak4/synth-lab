import { useHelp } from '../help/help-context';

interface Props {
  helpId: string;
  /** Human label of the thing being explained, for screen readers. */
  label: string;
  className?: string;
}

export function HelpButton({ helpId, label, className }: Props) {
  const { open } = useHelp();
  return (
    <button
      type="button"
      className={`help-btn ${className ?? ''}`}
      aria-label={`Help: ${label}`}
      data-help-button={helpId}
      onClick={() => open(helpId)}
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}
