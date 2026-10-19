// Feature switches. Code behind a switch is kept, not deleted, so it can come back.
export const FEATURES = {
  // The weekly intelligence report: removed for now at the client's request (19 Oct 2026); the
  // replacement approach is still to be decided. The server route answers 410 unless
  // WEEKLY_REPORT_ENABLED=1, and the entry points are hidden unless VITE_WEEKLY_REPORT=1.
  weeklyReport: import.meta.env.VITE_WEEKLY_REPORT === "1",
} as const;
