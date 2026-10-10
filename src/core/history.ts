/**
 * Undo/redo (plan T5.4): a command stack that is independent of what it edits.
 *
 * A `History<S>` is attached to one slice of document state through a small `host` (get/set). Each
 * entry is a `Command` that knows how to undo and redo itself. Continuous gestures (dragging a knob
 * or a note) coalesce into one entry, so one Cmd+Z undoes the whole drag.
 */

export interface Command<S> {
  label: string;
  /** Commands with the same key, recorded within the coalescing window, merge into one entry. */
  coalesceKey?: string;
  undo(state: S): S;
  redo(state: S): S;
}

export interface HistoryHost<S> {
  get(): S;
  set(state: S): void;
}

export interface HistoryOptions {
  /** Most entries kept; the oldest are dropped. */
  limit?: number;
  /** Same-key commands closer together than this merge. */
  coalesceMs?: number;
  now?: () => number;
}

export interface HistorySnapshot {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** Entries available to undo / redo. */
  undoDepth: number;
  redoDepth: number;
}

export const DEFAULT_LIMIT = 200;
export const DEFAULT_COALESCE_MS = 600;

interface Entry<S> {
  cmd: Command<S>;
  at: number;
}

export class History<S> {
  private undoStack: Entry<S>[] = [];
  private redoStack: Entry<S>[] = [];
  private listeners = new Set<() => void>();
  private groupDepth = 0;
  private grouped: Command<S>[] = [];
  private groupLabel = '';
  private sealed = false;
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;

  constructor(
    private readonly host: HistoryHost<S>,
    opts: HistoryOptions = {},
  ) {
    this.limit = opts.limit ?? DEFAULT_LIMIT;
    this.coalesceMs = opts.coalesceMs ?? DEFAULT_COALESCE_MS;
    this.now = opts.now ?? (() => Date.now());
  }

  // ── recording ───────────────────────────────────────────────────────────────────────────

  /** Apply `cmd` to the state, and record it. */
  execute(cmd: Command<S>): void {
    this.host.set(cmd.redo(this.host.get()));
    this.record(cmd);
  }

  /** Record a change that has already been applied (for example by a drag in progress). */
  record(cmd: Command<S>): void {
    if (this.groupDepth > 0) {
      this.grouped.push(cmd);
      return;
    }
    this.redoStack = [];
    const t = this.now();
    const top = this.undoStack.at(-1);
    if (
      top &&
      !this.sealed &&
      cmd.coalesceKey &&
      top.cmd.coalesceKey === cmd.coalesceKey &&
      t - top.at <= this.coalesceMs
    ) {
      top.cmd = merge(top.cmd, cmd);
      top.at = t;
    } else {
      this.undoStack.push({ cmd, at: t });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.sealed = false;
    this.emit();
  }

  /** Run `fn`; every command recorded inside becomes ONE undo step called `label`. */
  group<T>(label: string, fn: () => T): T {
    if (this.groupDepth === 0) {
      this.grouped = [];
      this.groupLabel = label;
    }
    this.groupDepth++;
    try {
      return fn();
    } finally {
      this.groupDepth--;
      if (this.groupDepth === 0 && this.grouped.length > 0) {
        const cmds = this.grouped;
        this.grouped = [];
        this.record({
          label: this.groupLabel,
          undo: (s) => [...cmds].reverse().reduce((acc, c) => c.undo(acc), s),
          redo: (s) => cmds.reduce((acc, c) => c.redo(acc), s),
        });
      }
    }
  }

  /** End the current gesture: the next command starts a new entry even if it would have merged. */
  endGesture(): void {
    this.sealed = true;
  }

  // ── undo / redo ─────────────────────────────────────────────────────────────────────────

  undo(): boolean {
    const e = this.undoStack.pop();
    if (!e) return false;
    this.host.set(e.cmd.undo(this.host.get()));
    this.redoStack.push(e);
    this.sealed = true;
    this.emit();
    return true;
  }

  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    this.host.set(e.cmd.redo(this.host.get()));
    this.undoStack.push(e);
    this.sealed = true;
    this.emit();
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.sealed = false;
    this.emit();
  }

  // ── inspection ──────────────────────────────────────────────────────────────────────────

  snapshot(): HistorySnapshot {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack.at(-1)?.cmd.label ?? null,
      redoLabel: this.redoStack.at(-1)?.cmd.label ?? null,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}

/** Two same-key commands in a row act as one: undo reverses both, redo repeats both. */
function merge<S>(a: Command<S>, b: Command<S>): Command<S> {
  return {
    label: b.label,
    coalesceKey: a.coalesceKey,
    undo: (s) => a.undo(b.undo(s)),
    redo: (s) => b.redo(a.redo(s)),
  };
}
