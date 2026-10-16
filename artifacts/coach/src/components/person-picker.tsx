import { OPPONENT_HEX, SKELETON_CONNECTIONS, YOU_HEX } from "@/lib/pose-track";
import type { Landmark } from "@/lib/pose";
import { poseBoxNorm } from "@/lib/pose-people";

// "Which one is you?" - shown BEFORE analysis when a clip has two people. A
// still from the clip with both tracked skeletons drawn, one blue and one red.
// Tap a skeleton or a button. The blue one is the suggestion (the person seen
// most / biggest), but nothing is assumed: the choice decides whose movement
// is scored. After the pick, "you" is blue everywhere and the other is red.

export type PickerPerson = { landmarks: Landmark[] };

export type PersonPickerData = {
  image: string; // JPEG data URL of the frame (no skeletons baked in)
  aspect: number; // width / height of the frame
  /** [0] is drawn blue, [1] is drawn red. Order = tracks order (best-tracked first). */
  people: [PickerPerson, PickerPerson];
};

const COLORS = [YOU_HEX, OPPONENT_HEX] as const;
const NAMES = ["Blue", "Red"] as const;
// Same threshold the picker still was chosen with (poseQuality): draw only joints the model is sure of.
const VIS = 0.5;

function Skeleton({ lm, vbW, color }: { lm: Landmark[]; vbW: number; color: string }) {
  const x = (p: Landmark) => p.x * vbW;
  const y = (p: Landmark) => p.y * 100;
  const ok = (p: Landmark | undefined): p is Landmark => !!p && p.visibility >= VIS;
  return (
    <g>
      {[3.2, 1.6].map((w, k) => (
        <g key={k} stroke={k === 0 ? "rgba(0,0,0,0.65)" : color} strokeWidth={w} strokeLinecap="round" fill="none">
          {SKELETON_CONNECTIONS.map(([a, b]) => {
            const pa = lm[a];
            const pb = lm[b];
            if (!ok(pa) || !ok(pb)) return null;
            return <line key={`${a}-${b}`} x1={x(pa)} y1={y(pa)} x2={x(pb)} y2={y(pb)} />;
          })}
        </g>
      ))}
      {[0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((i) => {
        const p = lm[i];
        if (!ok(p)) return null;
        return <circle key={i} cx={x(p)} cy={y(p)} r={i === 0 ? 1.7 : 1.2} fill={color} stroke="rgba(0,0,0,0.6)" strokeWidth={0.4} />;
      })}
    </g>
  );
}

export function PersonPicker({
  data,
  onPick,
  onCancel,
  mode = "athlete",
}: {
  data: PersonPickerData;
  onPick: (index: 0 | 1) => void;
  onCancel: () => void;
  /** "scout" = an Opponent Scout upload: pick whose movement is read (not "you"). */
  mode?: "athlete" | "scout";
}) {
  const vbW = data.aspect * 100;
  const scout = mode === "scout";
  const title = scout ? "Who are you scouting?" : "Which one is you?";
  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-4 py-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="person-picker"
    >
      <div className="text-center space-y-1.5 max-w-sm">
        <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-muted-foreground">Two people in this clip</div>
        <div className="font-mono text-lg uppercase tracking-[0.25em] text-foreground">{title}</div>
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground/80 leading-relaxed">
          {scout
            ? "Tap the fighter to scout, or use the buttons. Only their movement is read; the other person is ignored."
            : "Tap yourself, or use the buttons. Your read is scored on you only; the other fighter is tracked as your opponent."}
        </p>
      </div>

      <div
        className="relative border border-border/40 bg-black"
        style={{ aspectRatio: String(data.aspect), width: `min(100%, calc(52vh * ${data.aspect}))`, maxWidth: 520 }}
        data-testid="person-picker-frame"
      >
        <img src={data.image} alt="Frame from your clip with both fighters outlined" className="absolute inset-0 w-full h-full" draggable={false} />
        <svg viewBox={`0 0 ${vbW} 100`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {data.people.map((p, i) => (
            <Skeleton key={i} lm={p.landmarks} vbW={vbW} color={COLORS[i]!} />
          ))}
        </svg>
        {/* tap targets over each person's box */}
        {data.people.map((p, i) => {
          const box = poseBoxNorm(p.landmarks);
          if (!box) return null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i as 0 | 1)}
              aria-label={scout ? `Scout ${NAMES[i]}` : `${NAMES[i]} is me`}
              data-testid={`pick-skeleton-${NAMES[i]!.toLowerCase()}`}
              className="absolute"
              style={{
                left: `${(box.x - 0.02) * 100}%`,
                top: `${(box.y - 0.02) * 100}%`,
                width: `${(box.w + 0.04) * 100}%`,
                height: `${(box.h + 0.04) * 100}%`,
                border: `1.5px dashed ${COLORS[i]}`,
                background: "transparent",
              }}
            >
              <span
                className="absolute left-0 bottom-full whitespace-nowrap px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-black"
                style={{ background: COLORS[i] }}
              >
                {NAMES[i]}
                {i === 0 ? " · suggested" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex w-full max-w-[520px] gap-3">
        {([0, 1] as const).map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            data-testid={`pick-button-${NAMES[i]!.toLowerCase()}`}
            className="flex-1 py-3 font-mono text-[11px] uppercase tracking-[0.25em] border text-foreground active:scale-[0.98] transition-transform"
            style={{ borderColor: COLORS[i], background: `${COLORS[i]}22` }}
          >
            {scout ? `Scout ${NAMES[i]}` : `${NAMES[i]} is me`}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/70 hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
