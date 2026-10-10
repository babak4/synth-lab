/**
 * Canvas painter for the piano roll (plan T5.3a). All geometry comes from `core/piano-roll`; this file
 * only turns rectangles and lines into pixels. One canvas holds the whole widget: the corner, the bar
 * ruler along the top, the piano column on the left and the note grid.
 */
import { ticksPerBar, type Note, type Project, type Track } from '@/core/contracts/project';
import {
  barLabelStep,
  gridLines,
  indexFor,
  keyRows,
  layoutVisibleNotes,
  loopSpan,
  pitchToY,
  tickToX,
  velocityOpacity,
  visibleRange,
  type Box,
  type Size,
  type Viewport,
} from '@/core/piano-roll';
import type { DrawArgs } from '@/ui/visualisers/useCanvas';

export const KEY_WIDTH = 56;
export const RULER_HEIGHT = 24;
const FONT = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface Scene {
  project: Pick<Project, 'timeSignature' | 'lengthBars' | 'loop'>;
  /** The track being shown; its notes are drawn solid. */
  track: Track;
  /** Every other track, drawn faintly when `ghost` is on. */
  others: readonly Track[];
  ghost: boolean;
  viewport: Viewport;
  /** Length of the scrollable timeline in ticks (for the scroll indicators). */
  contentTicks: number;
  playheadTick?: number;
  /** Notes to draw instead of `track.notes` while a drag is previewing an edit. */
  notes?: readonly Note[];
  /** Ids of the selected notes. */
  selection?: ReadonlySet<string>;
  /** Selection rectangle being dragged. */
  box?: Box | null;
  /** Keyboard cursor: where Enter would add a note, and how long (ticks) that note would be. */
  cursor?: { tick: number; pitch: number; length: number } | null;
}

/** What a frame drew, for tests and diagnostics. */
export interface FrameStats {
  notes: number;
  selectedNotes: number;
  ghostNotes: number;
  gridLines: number;
  playheadX: number | null;
  /** Loop shading in grid-area pixels (may extend past the view), and whether the loop is on. */
  loop: { x0: number; x1: number; enabled: boolean };
}

/** Canvas size → the note grid's size (the part right of the keys and below the ruler). */
export const gridSize = (width: number, height: number): Size => ({
  width: Math.max(0, width - KEY_WIDTH),
  height: Math.max(0, height - RULER_HEIGHT),
});

const WHITE_KEY = '#f6f3ec';
const BLACK_KEY = '#2a2a2e';

export function drawPianoRoll({ ctx, width, height, colours }: DrawArgs, scene: Scene): FrameStats {
  const stats: FrameStats = { notes: 0, selectedNotes: 0, ghostNotes: 0, gridLines: 0, playheadX: null, loop: { x0: 0, x1: 0, enabled: false } };
  const grid = gridSize(width, height);
  const { viewport: vp, project, track } = scene;
  const sig = project.timeSignature;
  const range = visibleRange(vp, grid);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colours.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.font = FONT;
  ctx.textBaseline = 'middle';

  // ---- note grid -------------------------------------------------------------------------
  ctx.save();
  ctx.beginPath();
  ctx.rect(KEY_WIDTH, RULER_HEIGHT, grid.width, grid.height);
  ctx.clip();
  ctx.translate(KEY_WIDTH, RULER_HEIGHT);

  const rows = keyRows(vp, grid);
  for (const row of rows) {
    if (row.black) {
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(0, row.y, grid.width, row.h);
    }
    ctx.fillStyle = colours.grid;
    ctx.globalAlpha = row.pitch % 12 === 0 ? 0.7 : 0.22;
    ctx.fillRect(0, Math.round(row.y + row.h) - 1, grid.width, 1);
  }
  ctx.globalAlpha = 1;

  // Past the end of the song.
  const endX = tickToX(vp, project.lengthBars * ticksPerBar(sig));
  if (endX < grid.width) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(Math.max(0, endX), 0, grid.width - Math.max(0, endX), grid.height);
  }

  // Loop region.
  const loop = loopSpan(project.loop, sig);
  const loopX0 = tickToX(vp, loop.startTick);
  const loopX1 = tickToX(vp, loop.endTick);
  stats.loop = { x0: loopX0, x1: loopX1, enabled: project.loop.enabled };
  if (loopX1 > 0 && loopX0 < grid.width) {
    ctx.fillStyle = colours.accentSoft;
    ctx.globalAlpha = project.loop.enabled ? 0.5 : 0.18;
    ctx.fillRect(Math.max(0, loopX0), 0, Math.min(grid.width, loopX1) - Math.max(0, loopX0), grid.height);
    ctx.globalAlpha = 1;
  }

  // Bar, beat and sub-beat lines.
  const lines = gridLines(sig, range.tickFrom, range.tickTo, vp.pxPerTick);
  stats.gridLines = lines.length;
  for (const l of lines) {
    const x = Math.round(tickToX(vp, l.tick)) + 0.5;
    ctx.strokeStyle = l.kind === 'bar' ? colours.gridStrong : colours.grid;
    ctx.globalAlpha = l.kind === 'bar' ? 0.9 : l.kind === 'beat' ? 0.55 : 0.22;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, grid.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Ghost notes: other tracks, faint and flat.
  if (scene.ghost) {
    for (const other of scene.others) {
      ctx.fillStyle = other.colour;
      ctx.globalAlpha = 0.25;
      for (const r of layoutVisibleNotes(indexFor(other.notes), vp, grid)) {
        ctx.fillRect(r.x, r.y, r.w, r.h);
        stats.ghostNotes++;
      }
    }
    ctx.globalAlpha = 1;
  }

  // This track's notes: colour from the track, harder notes more opaque; selected ones are outlined and lit.
  const selection = scene.selection;
  ctx.lineWidth = 1;
  for (const r of layoutVisibleNotes(indexFor(scene.notes ?? track.notes), vp, grid)) {
    stats.notes++;
    const selected = selection?.has(r.id) === true;
    ctx.globalAlpha = velocityOpacity(r.velocity);
    ctx.fillStyle = track.colour;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    if (selected) {
      stats.selectedNotes++;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = colours.text;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2));
      ctx.lineWidth = 1;
    } else if (r.w >= 4 && r.h >= 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.max(1, r.w - 1), Math.max(1, r.h - 1));
    }
    // Resize handle hint on the right edge of notes wide enough to have one.
    if (r.w >= 14 && r.h >= 6) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(r.x + r.w - 3, r.y + 2, 2, r.h - 4);
    }
  }

  // Selection box.
  if (scene.box) {
    const x0 = tickToX(vp, scene.box.tick0);
    const x1 = tickToX(vp, scene.box.tick1);
    const y0 = pitchToY(vp, scene.box.pitch1 - 1);
    const y1 = pitchToY(vp, scene.box.pitch0 - 1);
    ctx.fillStyle = colours.accentSoft;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colours.accent;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(1, x1 - x0 - 1), Math.max(1, y1 - y0 - 1));
    ctx.setLineDash([]);
  }

  // Keyboard cursor.
  if (scene.cursor) {
    const cx = tickToX(vp, scene.cursor.tick);
    const cw = Math.max(6, scene.cursor.length * vp.pxPerTick);
    const cy = pitchToY(vp, scene.cursor.pitch);
    ctx.fillStyle = colours.text;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(cx + 1, cy + 1, cw - 2, vp.rowHeight - 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colours.text;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(cx + 1, cy + 1, cw - 2, vp.rowHeight - 2);
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }

  // Playhead.
  if (scene.playheadTick !== undefined) {
    const px = Math.round(tickToX(vp, scene.playheadTick)) + 0.5;
    if (px >= 0 && px <= grid.width) {
      stats.playheadX = px - 0.5;
      ctx.strokeStyle = colours.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, grid.height);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // Scroll indicators: thin bars at the right and bottom edges, only where there is more to see.
  ctx.fillStyle = colours.muted;
  ctx.globalAlpha = 0.55;
  const contentH = 128 * vp.rowHeight;
  if (contentH > grid.height + 1) {
    const th = Math.max(16, (grid.height / contentH) * grid.height);
    const ty = (vp.scrollY / (contentH - grid.height)) * (grid.height - th);
    ctx.fillRect(grid.width - 4, ty, 3, th);
  }
  const contentW = scene.contentTicks * vp.pxPerTick;
  if (contentW > grid.width + 1) {
    const tw = Math.max(16, (grid.width / contentW) * grid.width);
    const tx = ((vp.scrollTick * vp.pxPerTick) / (contentW - grid.width)) * (grid.width - tw);
    ctx.fillRect(Math.max(0, tx), grid.height - 4, tw, 3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ---- ruler -----------------------------------------------------------------------------
  ctx.save();
  ctx.beginPath();
  ctx.rect(KEY_WIDTH, 0, grid.width, RULER_HEIGHT);
  ctx.clip();
  ctx.translate(KEY_WIDTH, 0);
  if (project.loop.enabled && loopX1 > 0 && loopX0 < grid.width) {
    ctx.fillStyle = colours.accent;
    ctx.fillRect(Math.max(0, loopX0), RULER_HEIGHT - 5, Math.min(grid.width, loopX1) - Math.max(0, loopX0), 4);
  }
  const step = barLabelStep(sig, vp.pxPerTick);
  ctx.fillStyle = colours.text;
  ctx.textAlign = 'left';
  for (const l of lines) {
    const x = Math.round(tickToX(vp, l.tick)) + 0.5;
    if (l.kind === 'sub') continue;
    ctx.strokeStyle = colours.gridStrong;
    ctx.beginPath();
    ctx.moveTo(x, l.kind === 'bar' ? 4 : RULER_HEIGHT - 12);
    ctx.lineTo(x, RULER_HEIGHT - 6);
    ctx.stroke();
    if (l.kind === 'bar' && l.bar % step === 0) ctx.fillText(String(l.bar + 1), x + 4, 9);
  }
  if (scene.playheadTick !== undefined) {
    const px = tickToX(vp, scene.playheadTick);
    if (px >= -6 && px <= grid.width + 6) {
      ctx.fillStyle = colours.text;
      ctx.beginPath();
      ctx.moveTo(px - 5, RULER_HEIGHT - 9);
      ctx.lineTo(px + 5, RULER_HEIGHT - 9);
      ctx.lineTo(px, RULER_HEIGHT - 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // ---- piano column ----------------------------------------------------------------------
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, RULER_HEIGHT, KEY_WIDTH, grid.height);
  ctx.clip();
  ctx.translate(0, RULER_HEIGHT);
  for (const row of rows) {
    ctx.fillStyle = WHITE_KEY;
    ctx.fillRect(0, row.y, KEY_WIDTH, row.h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, Math.round(row.y + row.h) - 1, KEY_WIDTH, 1);
    if (row.black) {
      ctx.fillStyle = BLACK_KEY;
      ctx.fillRect(0, row.y, KEY_WIDTH * 0.62, row.h - 1);
    }
    if (row.label) {
      ctx.fillStyle = row.black ? WHITE_KEY : '#2a2a2e';
      ctx.textAlign = 'right';
      ctx.fillText(row.label, KEY_WIDTH - 5, row.y + row.h / 2);
    }
  }
  ctx.restore();

  // ---- corner and frame ------------------------------------------------------------------
  ctx.fillStyle = colours.bg;
  ctx.fillRect(0, 0, KEY_WIDTH, RULER_HEIGHT);
  ctx.fillStyle = colours.muted;
  ctx.textAlign = 'left';
  ctx.fillText(track.name.slice(0, 7), 6, RULER_HEIGHT / 2);
  ctx.strokeStyle = colours.gridStrong;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(KEY_WIDTH - 0.5, 0);
  ctx.lineTo(KEY_WIDTH - 0.5, height);
  ctx.moveTo(0, RULER_HEIGHT - 0.5);
  ctx.lineTo(width, RULER_HEIGHT - 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return stats;
}
