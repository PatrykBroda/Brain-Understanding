export const ARTS = ["BJJ", "BJJ + Striking", "MMA", "Wrestling", "Judo", "Other grappling"];
export const LEVELS = ["White", "Blue", "Purple", "Brown", "Black", "No belt / other"];
export const FREQUENCIES = ["1-2x / week", "3-4x / week", "5-6x / week", "Daily / pro"];

export const SPORTS: { value: string; label: string }[] = [
  { value: "bjj", label: "Brazilian Jiu-Jitsu" },
  { value: "mma", label: "MMA" },
  { value: "boxing", label: "Boxing" },
  { value: "muay_thai", label: "Muay Thai" },
  { value: "kickboxing", label: "Kickboxing" },
  { value: "wrestling", label: "Wrestling" },
  { value: "judo", label: "Judo" },
  { value: "karate", label: "Karate" },
  { value: "mixed", label: "Mixed / multiple" },
];

export function sportLabel(key: string): string {
  return SPORTS.find((s) => s.value === key)?.label ?? key;
}

export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
