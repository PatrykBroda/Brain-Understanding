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
  { key: "startPosition", label: "Start position" },
  { key: "constraint", label: "Constraint" },
  { key: "rounds", label: "Rounds" },
  { key: "failureCondition", label: "If it breaks down" },
  { key: "progression", label: "Progression" },
];

/**
 * Card anatomy shared by drill / breath / regulate blocks in chat:
 * kicker chip + title, then label rows separated by hairlines.
 */
export function DrillCard({ drill }: { drill: Drill }) {
  const rows = FIELDS.filter(({ key }) => drill[key]);
  return (
    <section className="glass my-5 overflow-hidden" aria-label={drill.title ? `Drill: ${drill.title}` : "Drill"}>
      <header className="px-5 pt-4 pb-3">
        <span className="chip chip-gold">Drill</span>
        {drill.title && (
          <h3 className="display-heading mt-2.5 !text-[1.1875rem]">{drill.title}</h3>
        )}
      </header>
      <dl className="px-5 pb-1">
        {rows.map(({ key, label }) => (
          <div
            key={key}
            className="grid grid-cols-1 sm:grid-cols-[132px_1fr] gap-x-4 gap-y-1 border-t border-white/[0.06] py-3"
          >
            <dt className="label pt-0.5">{label}</dt>
            <dd className="text-[0.9375rem] leading-[1.6] text-foreground/90">{drill[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
