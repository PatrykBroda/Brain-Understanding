import { beltKeyOf, beltMeaning, type BeltKey } from "@workspace/archetypes";

export function beltKey(level: string): BeltKey | null {
  return beltKeyOf(level);
}

// BJJ rank ladder. This component is rendered only for athletes whose primary
// sport is BJJ; other combat sports use their own experience or rank language.
type LadderRung = { key: string; label: string; cloth: string; ink: string };

const LADDER: LadderRung[] = [
  { key: "white", label: "White", cloth: "#ece7d8", ink: "#15130d" },
  { key: "blue", label: "Blue", cloth: "#1f5fc4", ink: "#04101f" },
  { key: "purple", label: "Purple", cloth: "#6b32c9", ink: "#0c0418" },
  { key: "brown", label: "Brown", cloth: "#5a3a22", ink: "#160d06" },
  { key: "black", label: "Black", cloth: "#1d1d1d", ink: "#000000" },
];

function rungFor(key: BeltKey | null): { rung: LadderRung; index: number } | null {
  if (!key) return null;
  const index = LADDER.findIndex((r) => r.key === key);
  if (index < 0) return null;
  return { rung: LADDER[index], index };
}

/* ----------------------------- Realistic belt ----------------------------- */
// A horizontal martial-arts belt: two crossing bands, a centre knot with
// hanging tails, gold edge stitching and a soft golden halo. The cloth keeps
// the rank colour; the gold only frames it — "white belt in a luxury system".
function RealisticBelt({ cloth, ink, label }: { cloth: string; ink: string; label: string }) {
  const isDarkCloth = cloth === "#1d1d1d";
  const stitch = isDarkCloth ? "rgba(212,199,163,0.5)" : "rgba(0,0,0,0.14)";
  const bandShade = `linear-gradient(180deg, rgba(255,255,255,0.14) 0%, ${cloth} 22%, ${cloth} 64%, rgba(0,0,0,0.28) 100%)`;

  return (
    <div className="relative w-full" aria-label={`${label} belt`}>
      <div className="relative h-[68px] w-full">
        {/* left band */}
        <Band side="left" shade={bandShade} stitch={stitch} />
        {/* right band */}
        <Band side="right" shade={bandShade} stitch={stitch} />

        {/* rank tip bar near right end (BJJ-style) */}
        <div
          className="absolute top-[14px] right-[14%] h-[40px] w-[26px] rounded-[2px]"
          style={{
            background: ink,
            boxShadow: "inset 0 1px 1px rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        />
        <div
          className="absolute top-[14px] right-[calc(14%+30px)] h-[40px] w-[3px]"
          style={{ background: "rgba(212,199,163,0.5)" }}
        />

        {/* centre knot */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          {/* tails hanging behind the knot */}
          <div
            className="absolute left-[6px] top-[18px] h-[40px] w-[20px] rotate-[8deg] rounded-b-[3px]"
            style={{ background: bandShade, boxShadow: "0 6px 10px -4px rgba(0,0,0,0.6)" }}
          />
          <div
            className="absolute left-[20px] top-[18px] h-[44px] w-[20px] -rotate-[7deg] rounded-b-[3px]"
            style={{ background: bandShade, boxShadow: "0 6px 10px -4px rgba(0,0,0,0.6)" }}
          />
          {/* knot block */}
          <div
            className="relative h-[40px] w-[46px] rounded-[4px]"
            style={{
              background: bandShade,
              boxShadow:
                "0 4px 12px -2px rgba(0,0,0,0.7), inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -2px 4px rgba(0,0,0,0.3)",
              border: "1px solid rgba(0,0,0,0.25)",
            }}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px]" style={{ background: stitch }} />
          </div>
        </div>

        {/* gold corner markers */}
        {(["left-1 top-1", "right-1 top-1", "left-1 bottom-1", "right-1 bottom-1"] as const).map((pos) => (
          <span
            key={pos}
            className={`absolute ${pos} h-[6px] w-[6px] pointer-events-none`}
            style={{
              borderColor: "rgba(212,199,163,0.6)",
              borderStyle: "solid",
              borderWidth: pos.includes("top")
                ? pos.includes("left")
                  ? "1px 0 0 1px"
                  : "1px 1px 0 0"
                : pos.includes("left")
                ? "0 0 1px 1px"
                : "0 1px 1px 0",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Band({ side, shade, stitch }: { side: "left" | "right"; shade: string; stitch: string }) {
  return (
    <div
      className={`absolute top-[14px] h-[40px] ${side === "left" ? "left-0 right-1/2 mr-[10px]" : "right-0 left-1/2 ml-[10px]"}`}
      style={{
        background: shade,
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12), 0 8px 16px -8px rgba(0,0,0,0.7)",
        borderRadius: side === "left" ? "3px 1px 1px 3px" : "1px 3px 3px 1px",
      }}
    >
      {/* edge stitching */}
      <div className="absolute inset-x-1 top-[4px] h-px" style={{ background: stitch }} />
      <div className="absolute inset-x-1 bottom-[4px] h-px" style={{ background: stitch }} />
      {/* gold edge line */}
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: "rgba(212,199,163,0.3)" }} />
    </div>
  );
}

/* ------------------------------- Rank ladder ------------------------------ */
function BeltLadder({ currentIndex }: { currentIndex: number }) {
  const current = LADDER[currentIndex];
  const next = currentIndex < LADDER.length - 1 ? LADDER[currentIndex + 1] : null;
  const summary = next
    ? `Rank progression: ${current.label} belt earned, ${currentIndex + 1} of ${LADDER.length}. Next: ${next.label}.`
    : `Rank progression: ${current.label} belt, the highest rung.`;
  return (
    <div className="flex items-center justify-between gap-1" role="img" aria-label={summary}>
      {LADDER.map((rung, i) => {
        const earned = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={rung.key} aria-hidden="true" className="flex flex-col items-center gap-1.5 flex-1">
            <span
              className={`block h-[10px] w-[10px] rounded-full transition-all duration-700`}
              style={{
                background: earned ? rung.cloth : "transparent",
                border: earned ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.12)",
                boxShadow: isCurrent ? "0 0 0 2px rgba(185,164,119,0.55)" : "none",
                opacity: earned ? 1 : 0.45,
              }}
              title={`${rung.label} belt`}
            />
            <span
              className="text-[0.8125rem] font-medium"
              style={{ color: isCurrent ? "#D4C7A3" : earned ? "#A4A8AE" : "#8A8F96" }}
            >
              {rung.label.slice(0, 3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- Export --------------------------------- */
export function Belt({ level, showMeaning = true }: { level: string; showMeaning?: boolean }) {
  const key = beltKey(level);
  const info = rungFor(key);
  const meaning = key ? beltMeaning(key) : null;

  if (!info) {
    return (
      <div>
        <div className="h-[68px] w-full border border-white/10 bg-[#111316] flex items-center justify-center rounded-[14px]">
          <span className="label">Unranked or other</span>
        </div>
      </div>
    );
  }

  const { rung, index } = info;
  const next = index < LADDER.length - 1 ? LADDER[index + 1] : null;

  return (
    <div className="space-y-4">
      <RealisticBelt cloth={rung.cloth} ink={rung.ink} label={rung.label} />

      <div className="flex items-baseline justify-between">
        <div className="text-[1rem] font-medium text-foreground">
          {rung.label} belt
        </div>
        {next ? (
          <div className="label">Next: {next.label}</div>
        ) : (
          <div className="label !text-[#D4C7A3]">Highest rank</div>
        )}
      </div>

      <BeltLadder currentIndex={index} />

      {showMeaning && meaning && (
        <div className="border-l-2 border-white/15 pl-3 pt-0.5">
          <div className="text-[0.9375rem] font-medium text-[#D4C7A3]">
            {meaning.state}
          </div>
          <p className="text-[0.9375rem] text-muted-foreground leading-[1.55] mt-1">{meaning.meaning}</p>
        </div>
      )}

    </div>
  );
}
