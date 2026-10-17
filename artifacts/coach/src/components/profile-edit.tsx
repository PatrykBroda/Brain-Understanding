import { useState } from "react";
import { useUpdateFighter } from "@/hooks/use-fighter";
import type { Fighter, FighterUpdate } from "@/lib/api";
import {
  levelsForSport,
  levelLabelForSport,
  FREQUENCIES,
  SPORTS,
  SPORT_STYLE_QUESTIONS,
  STANCES,
  WEIGHT_CLASSES,
  composeArt,
  sportLabel,
  ageFromDob,
} from "@/lib/fighter-options";

const FIELD_LABEL = "label block mb-1.5";
const INPUT_CLASS =
  "field-glass !py-0";

type FormState = {
  name: string;
  dateOfBirth: string;
  heightCm: string;
  weightKg: string;
  reachCm: string;
  gym: string;
  headCoach: string;
  record: string;
  stance: string;
  weightClass: string;
  primarySport: string;
  art: string;
  level: string;
  trainingFrequency: string;
  goals: string;
  weaknesses: string;
  bio: string;
  competes: boolean;
};

function toForm(f: Fighter): FormState {
  return {
    name: f.name,
    dateOfBirth: f.dateOfBirth ?? "",
    heightCm: f.heightCm != null ? String(f.heightCm) : "",
    weightKg: f.weightKg != null ? String(f.weightKg) : "",
    reachCm: f.reachCm != null ? String(f.reachCm) : "",
    gym: f.gym ?? "",
    headCoach: f.headCoach ?? "",
    record: f.record ?? "",
    stance: f.stance ?? "",
    weightClass: f.weightClass ?? "",
    primarySport: f.primarySport || "",
    art: f.art,
    level: f.level,
    trainingFrequency: f.trainingFrequency,
    goals: f.goals,
    weaknesses: f.weaknesses,
    bio: f.bio ?? "",
    competes: f.competes,
  };
}

export function ProfileEdit({ fighter, onClose }: { fighter: Fighter; onClose: () => void }) {
  const update = useUpdateFighter();
  const [form, setForm] = useState<FormState>(() => toForm(fighter));

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || update.isPending) return;
    const heightCm = form.heightCm.trim() === "" ? null : parseInt(form.heightCm, 10);
    const weightKg = form.weightKg.trim() === "" ? null : parseInt(form.weightKg, 10);
    const reachCm = form.reachCm.trim() === "" ? null : parseInt(form.reachCm, 10);
    const patch: FighterUpdate = {
      name: form.name.trim(),
      heightCm: heightCm != null && Number.isNaN(heightCm) ? null : heightCm,
      weightKg: weightKg != null && Number.isNaN(weightKg) ? null : weightKg,
      reachCm: reachCm != null && Number.isNaN(reachCm) ? null : reachCm,
      gym: form.gym,
      headCoach: form.headCoach,
      record: form.record.trim(),
      stance: form.stance,
      weightClass: form.weightClass,
      primarySport: form.primarySport,
      art: form.art,
      level: form.level,
      trainingFrequency: form.trainingFrequency,
      goals: form.goals,
      weaknesses: form.weaknesses,
      bio: form.bio,
      competes: form.competes,
    };
    // DOB is the source of truth for age; only send it when set (empty would be rejected server-side).
    if (form.dateOfBirth) patch.dateOfBirth = form.dateOfBirth;
    update.mutate(patch, { onSuccess: () => onClose() });
  };

  const nameError = form.name.trim() ? null : "Enter your name";
  const computedAge = ageFromDob(form.dateOfBirth);

  // Sport-conditional art options, value-safe: the stored art is always kept
  // as an option even if it isn't derivable from the current sport's question
  // (e.g. legacy values, or the sport was just changed without re-picking).
  const artOptions = (() => {
    const sport = form.primarySport;
    const q = sport ? SPORT_STYLE_QUESTIONS[sport] : undefined;
    const opts: string[] = [];
    if (sport && q && q.storeIn === "art") {
      for (const o of q.options) {
        const composed = composeArt(sport, o);
        if (!opts.includes(composed)) opts.push(composed);
      }
    }
    if (sport) {
      const base = sportLabel(sport);
      if (!opts.includes(base)) opts.push(base);
    }
    if (form.art && !opts.includes(form.art)) opts.unshift(form.art);
    return opts;
  })();

  return (
    <form onSubmit={submit} className="glass space-y-5 p-5" aria-label="Edit profile">
      <h2 className="section-title !text-[1.25rem]">Edit profile</h2>

      <div>
        <label className={FIELD_LABEL}>Name / Callsign</label>
        <input
          className={INPUT_CLASS}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={60}
          required
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "profile-name-error" : undefined}
        />
        {nameError && (
          <p id="profile-name-error" role="alert" className="mt-1.5 text-[0.875rem] text-[#E5645A]">
            {nameError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={FIELD_LABEL}>Date of birth</label>
          <input
            type="date"
            className={INPUT_CLASS}
            value={form.dateOfBirth}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => set("dateOfBirth", e.target.value)}
          />
          {computedAge != null && (
            <p className="mt-1.5 text-[0.875rem] text-muted-foreground">
              {computedAge} years old
            </p>
          )}
        </div>
        <div>
          <label className={FIELD_LABEL}>Training frequency</label>
          <select
            className={INPUT_CLASS}
            value={form.trainingFrequency}
            onChange={(e) => set("trainingFrequency", e.target.value)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={FIELD_LABEL}>Height (cm)</label>
          <input
            type="number"
            inputMode="numeric"
            className={INPUT_CLASS}
            value={form.heightCm}
            min={100}
            max={250}
            placeholder="e.g. 178"
            onChange={(e) => set("heightCm", e.target.value)}
          />
        </div>
        <div>
          <label className={FIELD_LABEL}>Weight (kg)</label>
          <input
            type="number"
            inputMode="numeric"
            className={INPUT_CLASS}
            value={form.weightKg}
            min={30}
            max={250}
            placeholder="e.g. 80"
            onChange={(e) => set("weightKg", e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={FIELD_LABEL}>Reach (cm)</label>
        <input
          type="number"
          inputMode="numeric"
          className={INPUT_CLASS}
          value={form.reachCm}
          min={100}
          max={260}
          placeholder="e.g. 180"
          onChange={(e) => set("reachCm", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={FIELD_LABEL}>Stance</label>
          <select
            className={INPUT_CLASS}
            value={form.stance}
            onChange={(e) => set("stance", e.target.value)}
          >
            <option value="">Not set</option>
            {STANCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Weight class</label>
          <select
            className={INPUT_CLASS}
            value={form.weightClass}
            onChange={(e) => set("weightClass", e.target.value)}
          >
            <option value="">Not set</option>
            {WEIGHT_CLASSES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={FIELD_LABEL}>Record (wins-losses-draws)</label>
        <input
          className={INPUT_CLASS}
          value={form.record}
          placeholder="e.g. 8-1-0"
          onChange={(e) => set("record", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={FIELD_LABEL}>Gym / team</label>
          <input
            className={INPUT_CLASS}
            value={form.gym}
            placeholder="Where you train"
            onChange={(e) => set("gym", e.target.value)}
          />
        </div>
        <div>
          <label className={FIELD_LABEL}>Head coach</label>
          <input
            className={INPUT_CLASS}
            value={form.headCoach}
            placeholder="Lead trainer"
            onChange={(e) => set("headCoach", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={FIELD_LABEL}>Primary combat sport</label>
          <select
            className={INPUT_CLASS}
            value={form.primarySport}
            onChange={(e) => {
              const sport = e.target.value;
              setForm((current) => ({
                ...current,
                primarySport: sport,
                art: sport ? sportLabel(sport) : current.art,
                level: levelsForSport(sport || "mma")[0],
              }));
            }}
          >
            <option value="">Not set</option>
            {/* Legacy sports (karate/sambo/mixed…) are no longer offered, but the
                stored value stays selectable so old profiles aren't misrepresented. */}
            {form.primarySport && !SPORTS.some((s) => s.value === form.primarySport) && (
              <option value={form.primarySport}>{sportLabel(form.primarySport)}</option>
            )}
            {SPORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>
            {levelLabelForSport(form.primarySport)}
          </label>
          <select
            className={INPUT_CLASS}
            value={form.level}
            onChange={(e) => set("level", e.target.value)}
          >
            {(() => {
              const opts = levelsForSport(form.primarySport || "mma");
              return opts;
            })().map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={FIELD_LABEL}>Primary art / style</label>
        <select
          className={INPUT_CLASS}
          value={form.art}
          onChange={(e) => set("art", e.target.value)}
        >
          {artOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={FIELD_LABEL}>Goals</label>
        <textarea
          className={`${INPUT_CLASS} min-h-[88px] resize-y !py-3`}
          value={form.goals}
          onChange={(e) => set("goals", e.target.value)}
        />
      </div>

      <div>
        <label className={FIELD_LABEL}>Weaknesses</label>
        <textarea
          className={`${INPUT_CLASS} min-h-[88px] resize-y !py-3`}
          value={form.weaknesses}
          onChange={(e) => set("weaknesses", e.target.value)}
        />
      </div>

      <div>
        <label className={FIELD_LABEL}>Bio — about you (read by FRAME every session)</label>
        <textarea
          className={`${INPUT_CLASS} min-h-[104px] resize-y !py-3`}
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          placeholder="A few sentences about your background, injuries, competition history, or anything else that shapes how you train."
        />
      </div>

      <label className="flex items-center gap-3 min-h-[44px] text-[1rem] text-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-5 h-5 accent-[#B9A477]"
          checked={form.competes}
          onChange={(e) => set("competes", e.target.checked)}
        />
        <span>I compete (or plan to within 6 months)</span>
      </label>

      {update.isError && (
        <div role="alert" className="text-[0.9375rem] text-[#E5645A]">
          {(update.error as Error).message}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={onClose} className="btn-glass !min-h-[48px]">
          Cancel
        </button>
        <button
          type="submit"
          disabled={update.isPending || !form.name.trim()}
          data-loading={update.isPending ? "true" : undefined}
          className="btn-bronze flex-1 !min-h-[48px]"
        >
          Save profile
        </button>
      </div>
    </form>
  );
}
