// Shared playback clock for the footage visuals. The <video> (or the ghost
// player on saved reports) owns the real time and pushes it here; the timeline,
// the graphs and the overlays read it and can ask for a seek. Time updates go
// straight to subscribers (refs / DOM writes) — never through React state — so
// scrubbing and playing stay cheap on a phone WebView.

type TimeListener = (t: number) => void;
type Seeker = (t: number) => void;

export class Playback {
  /** Current media time in seconds. */
  time = 0;
  /** Length of what is being played (seconds); 0 until known. */
  duration = 0;
  private listeners = new Set<TimeListener>();
  private seeker: Seeker | null = null;

  /** Subscribe to time changes. Returns the unsubscribe function. */
  subscribe(cb: TimeListener): () => void {
    this.listeners.add(cb);
    cb(this.time);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Called by the owner of the clock (video / ghost player). */
  emit(t: number): void {
    this.time = t;
    for (const cb of this.listeners) cb(t);
  }

  /** The owner registers how to move its clock; returns an unregister fn. */
  setSeeker(fn: Seeker | null): () => void {
    this.seeker = fn;
    return () => {
      if (this.seeker === fn) this.seeker = null;
    };
  }

  /** Ask the owner to jump to t (clamped to [0, duration] when known). */
  seek(t: number): void {
    const max = this.duration > 0 ? this.duration : Infinity;
    const clamped = Math.max(0, Math.min(max, t));
    if (this.seeker) this.seeker(clamped);
    else this.emit(clamped);
  }

  /** Back to 0 for a new report. Seekers belong to their components (they unregister themselves). */
  reset(duration = 0): void {
    this.duration = duration;
    this.emit(0);
  }
}

export const SNAP_PX = 14;

/** Timestamp of the marker nearest to x (px along a bar of `width`), or null if none is within SNAP_PX. */
export function nearestMarker(timestamps: number[], dur: number, x: number, width: number): number | null {
  let best: number | null = null;
  let bestD = SNAP_PX + 1e-6;
  for (const t of timestamps) {
    const d = Math.abs((Math.min(1, Math.max(0, t / dur)) * width) - x);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}
