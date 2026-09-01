export type DateOfBirthParts = {
  day: string;
  month: string;
  year: string;
};

function numericPart(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function normaliseDateOfBirthPart(
  value: string,
  part: keyof DateOfBirthParts,
): string {
  return numericPart(value, part === "year" ? 4 : 2);
}

export function dateOfBirthFromParts(
  parts: DateOfBirthParts,
  today = new Date(),
): string | null {
  if (
    !/^\d{1,2}$/.test(parts.day) ||
    !/^\d{1,2}$/.test(parts.month) ||
    !/^\d{4}$/.test(parts.year)
  ) {
    return null;
  }

  const day = Number(parts.day);
  const month = Number(parts.month);
  const year = Number(parts.year);
  const currentYear = today.getUTCFullYear();

  if (year < 1900 || year > currentYear || month < 1 || month > 12) {
    return null;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const todayIso = [
    today.getUTCFullYear(),
    String(today.getUTCMonth() + 1).padStart(2, "0"),
    String(today.getUTCDate()).padStart(2, "0"),
  ].join("-");

  return iso <= todayIso ? iso : null;
}

export function ageFromDateOfBirth(
  isoDate: string,
  today = new Date(),
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let age = today.getUTCFullYear() - year;
  const monthDelta = today.getUTCMonth() + 1 - month;

  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < day)) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
}