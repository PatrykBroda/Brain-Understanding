export type Drill = {
  title?: string;
  objective?: string;
  startPosition?: string;
  constraint?: string;
  rounds?: string;
  failureCondition?: string;
  progression?: string;
};

const FIELDS: { key: keyof Drill; label: string }[] = [
  { key: "objective", label: "Objective" },
  { key: "startPosition", label: "Start" },
  { key: "constraint", label: "Constraint" },
  { key: "rounds", label: "Rounds" },
  { key: "failureCondition", label: "Failure → Reset" },
  { key: "progression", label: "Progression" },
];

export function DrillCard({ drill }: { drill: Drill }) {
  return (
    <div className="my-4 border border-primary/30 bg-primary/5">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/20 bg-primary/10">
        <div className="font-mono text-[10px] uppercase tracking-widest text-primary/80">
          Prescription
        </div>
        <div className="font-mono text-[10px] text-primary/60">DRILL</div>
      </div>
      {drill.title && (
        <div className="px-4 pt-4 pb-2 font-mono text-sm text-foreground tracking-wide uppercase">
          {drill.title}
        </div>
      )}
      <div className="px-4 pb-4 pt-2 grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-[0.85rem]">
        {FIELDS.map(({ key, label }) =>
          drill[key] ? (
            <div key={key} className="contents">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground pt-0.5">
                {label}
              </div>
              <div className="text-foreground/90 leading-relaxed">{drill[key]}</div>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
