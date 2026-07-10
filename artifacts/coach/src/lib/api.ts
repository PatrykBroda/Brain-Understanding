const base = import.meta.env.BASE_URL;

export type Fighter = {
  id: number;
  name: string;
  age: number;
  dateOfBirth: string | null;
  art: string;
  primarySport: string;
  level: string;
  trainingFrequency: string;
  gym: string;
  headCoach: string;
  heightCm: number | null;
  weightKg: number | null;
  reachCm: number | null;
  weightClass: string;
  stance: string;
  record: string;
  heroImageUrl: string;
  heroPosX: number;
  heroPosY: number;
  heroZoom: number;
  goals: string;
  weaknesses: string;
  competes: boolean;
  personality: string;
  bio: string;
  spiritAnimal: string;
  spiritAnimalTagline: string;
  vocabularyLevel: number;
  createdAt: string;
  updatedAt: string;
};

export type AttachmentDto = {
  id: number;
  kind: "image" | "video";
  mimeType: string;
  filename: string;
  sizeBytes: number;
};

export type ServerMessage = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: AttachmentDto[];
};

export type AiProvider = "claude" | "openai";

export type Conversation = {
  id: number;
  fighterId: number;
  aiProvider: AiProvider;
  startedAt: string;
  endedAt: string | null;
};

export type CalibrationQuestion = {
  key: string;
  prompt: string;
  options: string[];
};

export type FighterInput = {
  name: string;
  // DOB is required and is the source of truth; the server derives `age` from it.
  dateOfBirth: string;
  art: string;
  primarySport?: string;
  level: string;
  trainingFrequency: string;
  gym?: string;
  headCoach?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  reachCm?: number | null;
  weightClass?: string;
  stance?: string;
  record?: string;
  goals: string;
  weaknesses: string;
  competes: boolean;
  personality: string;
  bio?: string;
};

export type FighterUpdate = Partial<FighterInput> & {
  // Hero framing (athlete-adjustable): focal point 0-100, zoom 100-250.
  heroPosX?: number;
  heroPosY?: number;
  heroZoom?: number;
};

export type FactCategory =
  | "strength"
  | "weakness"
  | "technical_knowledge"
  | "pattern"
  | "preference"
  | "event"
  | "goal"
  | "context";

// One sighting in a fact's evidence trail (server-owned; confidence is
// derived from these — the client only ever displays them).
export type FactSourceEntry = {
  type: string;
  ref: string;
  at: string;
};

export type AthleteFact = {
  id: number;
  fighterId: number;
  category: FactCategory;
  // Fixed-ontology "<domain>.<facet>" key (e.g. "striking.exits"), null for legacy rows
  subcategory?: string | null;
  topic: string;
  content: string;
  confidence: number;
  status: "active" | "superseded" | "resolved";
  source: string;
  sources?: FactSourceEntry[];
  evidenceCount?: number;
  lastConfirmedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

// Structured, user-facing API failure. `title` + `causes` drive a readable
// error card instead of a raw "Failed to fetch" / status string. `kind` lets
// callers branch (e.g. only offer Retry on transient failures).
export type ApiErrorKind =
  | "network"
  | "timeout"
  | "auth"
  | "payload"
  | "rate_limit"
  | "upgrade_required"
  | "server"
  | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  title: string;
  causes: string[];
  retryable: boolean;
  detail: string;
  /** Set on kind "upgrade_required": which gated feature triggered the 402. */
  feature: string;

  constructor(opts: {
    kind: ApiErrorKind;
    status?: number | null;
    title: string;
    causes: string[];
    retryable: boolean;
    detail?: string;
    feature?: string;
  }) {
    // Base `message` carries title + causes so legacy callers that only read
    // `err.message` still surface actionable detail; structured fields below
    // drive richer UIs (e.g. the Analyse error card).
    super(opts.causes.length ? `${opts.title}: ${opts.causes.join("; ")}` : opts.title);
    this.name = "ApiError";
    this.kind = opts.kind;
    this.status = opts.status ?? null;
    this.title = opts.title;
    this.causes = opts.causes;
    this.retryable = opts.retryable;
    this.detail = opts.detail ?? "";
    this.feature = opts.feature ?? "";
  }
}

function classifyStatus(status: number, body: string): ApiError {
  if (status === 401 || status === 403) {
    return new ApiError({
      kind: "auth",
      status,
      title: "You're signed out",
      causes: ["Your session expired", "You need to sign in again"],
      retryable: false,
      detail: body,
    });
  }
  if (status === 413) {
    return new ApiError({
      kind: "payload",
      status,
      title: "That clip is too large to send",
      causes: ["The video or its key frames exceeded the upload limit", "Try a shorter clip"],
      retryable: false,
      detail: body,
    });
  }
  if (status === 422) {
    let msg = body.trim();
    try {
      const parsed = JSON.parse(body);
      if (parsed.error) msg = parsed.error;
    } catch {}
    return new ApiError({
      kind: "unknown",
      status,
      title: "FRAME REPORT requires combat sports footage",
      causes: [msg || "The clip did not show recognisable combat sports training."],
      retryable: false,
      detail: body,
    });
  }
  if (status === 402) {
    let msg = body.trim();
    let feature = "";
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error) msg = String(parsed.error);
      if (parsed?.feature) feature = String(parsed.feature);
    } catch {}
    return new ApiError({
      kind: "upgrade_required",
      status,
      title: "FRAME+ required",
      causes: [msg || "This is a FRAME+ feature."],
      retryable: false,
      detail: body,
      feature,
    });
  }
  if (status === 429) {
    return new ApiError({
      kind: "rate_limit",
      status,
      title: "Too many requests",
      causes: ["The AI service is rate-limited right now", "Wait a moment and try again"],
      retryable: true,
      detail: body,
    });
  }
  if (status === 502 || status === 503 || status === 504) {
    return new ApiError({
      kind: "server",
      status,
      title: "The analysis service is unavailable",
      causes: ["The server may be restarting", "The AI request may have timed out"],
      retryable: true,
      detail: body,
    });
  }
  if (status >= 500) {
    return new ApiError({
      kind: "server",
      status,
      title: "Something broke on the server",
      causes: [body.trim() || "The server hit an unexpected error"],
      retryable: true,
      detail: body,
    });
  }
  return new ApiError({
    kind: "unknown",
    status,
    title: "Request failed",
    causes: [body.trim() || `Server responded ${status}`],
    retryable: status >= 500,
    detail: body,
  });
}

// Per-request timeout (ms). The on-device pose pass already happened by the time
// we POST, so this only bounds the server round-trip (DB + Claude narrative).
// Sits just above the server's 55s AI-call cap so a real server error/timeout
// arrives first as a clean response; this only fires if the connection is
// silently black-holed, bounding the worst-case spinner instead of hanging.
const REQUEST_TIMEOUT_MS = 70_000;

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch (err) {
    // fetch only rejects on network failure or abort — never on HTTP status.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError({
        kind: "timeout",
        title: "The request timed out",
        causes: [
          "The analysis is taking longer than expected",
          "The server may be busy or waking up",
        ],
        retryable: true,
      });
    }
    throw new ApiError({
      kind: "network",
      title: "Can't reach the server",
      causes: [
        "You may be offline",
        "The server may be offline or restarting",
      ],
      retryable: true,
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw classifyStatus(res.status, txt);
  }
  return res.json() as Promise<T>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const api = {
  getFighter: () => jsonFetch<{ fighter: Fighter | null }>("api/fighter"),
  saveFighter: (input: FighterInput) =>
    jsonFetch<{ fighter: Fighter }>("api/fighter", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateFighter: (input: FighterUpdate) =>
    jsonFetch<{ fighter: Fighter }>("api/fighter", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  uploadHero: async (file: File) => {
    const dataBase64 = await fileToBase64(file);
    return jsonFetch<{ fighter: Fighter }>("api/fighter/hero", {
      method: "POST",
      body: JSON.stringify({
        mimeType: file.type,
        filename: file.name,
        dataBase64,
      }),
    });
  },
  removeHero: () =>
    jsonFetch<{ fighter: Fighter }>("api/fighter/hero", { method: "DELETE" }),
  getActiveConversation: () =>
    jsonFetch<{ conversation: Conversation | null; messages: ServerMessage[] }>(
      "api/conversation/active",
    ),
  setConversationProvider: (provider: AiProvider) =>
    jsonFetch<{ conversation: Conversation }>("api/conversation/active/provider", {
      method: "PATCH",
      body: JSON.stringify({ provider }),
    }),
  resetConversation: () =>
    jsonFetch<{ conversation: Conversation; messages: ServerMessage[] }>(
      "api/conversation/reset",
      { method: "POST" },
    ),
  getNextCalibration: () =>
    jsonFetch<{ question: CalibrationQuestion | null }>("api/calibration/next"),
  answerCalibration: (key: string, answer: string) =>
    jsonFetch<{ ok: true }>("api/calibration/answer", {
      method: "POST",
      body: JSON.stringify({ key, answer }),
    }),
  getMemory: () => jsonFetch<{ facts: AthleteFact[]; count: number }>("api/memory"),
  postWelcome: () =>
    jsonFetch<{ message: ServerMessage | null; reason?: string }>("api/coach/welcome", {
      method: "POST",
    }),
  uploadAttachment: async (
    conversationId: number,
    file: File,
  ): Promise<AttachmentDto> => {
    const dataBase64 = await fileToBase64(file);
    const kind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const res = await jsonFetch<{ attachment: AttachmentDto }>("api/attachments", {
      method: "POST",
      body: JSON.stringify({
        conversationId,
        kind,
        mimeType: file.type,
        filename: file.name,
        dataBase64,
      }),
    });
    return res.attachment;
  },
};

export type PlanCategory = "fix" | "train" | "technique" | "regulate" | "goal_step";

export type PlanItem = {
  key: string;
  category: PlanCategory;
  title: string;
  detail: string;
  suggestedDays: string;
  sourceFactIds: number[];
  sourceCalibrationKeys: string[];
  sourceLabel: string;
  // Free tier: server strips detail on all but the first item and marks them locked.
  locked?: boolean;
};

export type WeeklyPlan = {
  id: number;
  fighterId: number;
  weekStart: string;
  aiProvider: AiProvider;
  items: PlanItem[];
  rationale: string | null;
  createdAt: string;
};

export type PlannerResponse = {
  plan: WeeklyPlan | null;
  completions: string[];
  weekStart: string;
  // True when the server returned a free-tier mission preview.
  preview?: boolean;
};

export const plannerApi = {
  get: () => jsonFetch<PlannerResponse>("api/planner/current"),
  regenerate: () => jsonFetch<PlannerResponse>("api/planner/regenerate", { method: "POST" }),
  complete: (key: string) =>
    jsonFetch<{ ok: true }>(`api/planner/items/${encodeURIComponent(key)}/complete`, {
      method: "POST",
    }),
  uncomplete: (key: string) =>
    jsonFetch<{ ok: true }>(`api/planner/items/${encodeURIComponent(key)}/complete`, {
      method: "DELETE",
    }),
};

export type AnalysisKind =
  | "sparring"
  | "padwork"
  | "shadowboxing"
  | "drilling"
  | "movement"
  | "lifting";

export type NervousSystemLoad = "low" | "moderate" | "elevated" | "high";

export type AnalysisFinding = {
  title: string;
  observation: string;
  nervousSystemFraming: string;
  severity: "low" | "medium" | "high";
  area: string;
};

export type AnalysisSignal = {
  key: string;
  label: string;
  value: string;
  detail: string;
};

export type AnalysisMetrics = {
  framesAnalysed: number;
  poseFrames: number;
  durationSec: number;
  loadBasis: string;
  signals: AnalysisSignal[];
};

export type AnalysisKeyframe = {
  timestamp: number;
  imageBase64: string;
  caption: string;
  eventType?: string;
};

export type AnalysisScore = {
  key: string;
  label: string;
  value: number;
  basis: string;
};

export type StyleParallel = {
  name: string;
  note: string;
};

export type DetectedEvent = {
  timestamp: number;
  type: string;
  label: string;
  severity: "low" | "medium" | "high";
};

export type AnalysisComparison = {
  deltas: { key: string; label: string; delta: number }[];
  note: string;
};

export type VideoAnalysis = {
  id: number;
  fighterId: number;
  kind: AnalysisKind;
  focus: string;
  nervousSystemLoad: NervousSystemLoad;
  fragmentationRisk: NervousSystemLoad;
  sessionScore: number;
  styleProfile: string;
  aiComment: string;
  summary: string;
  findings: AnalysisFinding[];
  scores: AnalysisScore[];
  styleParallels: StyleParallel[];
  detectedEvents: DetectedEvent[];
  comparison: AnalysisComparison | null;
  metrics: AnalysisMetrics;
  keyframes: AnalysisKeyframe[];
  keyframeNotes: Record<number, string>;
  durationSec: number;
  createdAt: string;
  prevSignals?: AnalysisSignal[] | null;
  signalHistory?: { id: number; createdAt: string; signals: AnalysisSignal[] }[] | null;
  liveComparison?: AnalysisComparison | null;
};

export type AnalysisListItem = {
  id: number;
  kind: AnalysisKind;
  // Nullable: on the free tier the server strips everything but id/kind/date
  // from all rows except the most recent, and flags them locked.
  nervousSystemLoad: NervousSystemLoad | null;
  sessionScore: number | null;
  styleProfile: string | null;
  summary: string | null;
  durationSec: number;
  createdAt: string;
  scores: AnalysisScore[] | null;
  locked?: boolean;
};

// "Athlete Model Updated" payload returned by POST /api/analysis — every
// value read back from the DB after real writes, never estimated client-side.
export type AnalysisModelUpdate = {
  newObservations: {
    id: number;
    category: string;
    subcategory: string | null;
    topic: string;
    content: string;
    confidence: number;
  }[];
  confirmed: {
    id: number;
    topic: string;
    content: string;
    evidenceCount: number;
    previousConfidence: number;
    confidence: number;
  }[];
  confidencePointsDelta: number;
};

export type CreateAnalysisInput = {
  kind: AnalysisKind;
  focus: string;
  load: NervousSystemLoad;
  fragmentationRisk: NervousSystemLoad;
  loadBasis: string;
  sessionScore: number;
  durationSec: number;
  framesAnalysed: number;
  poseFrames: number;
  signals: AnalysisSignal[];
  scores: AnalysisScore[];
  detectedEvents: DetectedEvent[];
  keyframes: AnalysisKeyframe[];
};

// Fetch a pasted video link via the server proxy and return it as a File so the
// EXISTING on-device pose pass (which needs a seekable same-origin Blob) runs
// unchanged. Its own AbortController + generous timeout: the server may run
// yt-dlp or download a large file, which is far slower than a JSON round-trip.
const REMOTE_FETCH_TIMEOUT_MS = 150_000;

export async function fetchRemoteVideo(url: string): Promise<File> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}api/analysis/fetch-remote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError({
        kind: "timeout",
        title: "Fetching the video timed out",
        causes: [
          "The source took too long — large or slow links may not finish",
          "Try a shorter clip, or download it and upload it directly",
        ],
        retryable: true,
      });
    }
    throw new ApiError({
      kind: "network",
      title: "Can't reach the server",
      causes: ["You may be offline", "The server may be offline or restarting"],
      retryable: true,
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    window.clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body.trim();
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error) msg = String(parsed.error);
    } catch {}
    if (res.status === 401 || res.status === 403) {
      throw new ApiError({
        kind: "auth",
        status: res.status,
        title: "You're signed out",
        causes: ["Your session expired", "You need to sign in again"],
        retryable: false,
        detail: body,
      });
    }
    if (res.status === 429) {
      throw new ApiError({
        kind: "rate_limit",
        status: res.status,
        title: "The server is busy",
        causes: [msg || "Another clip is being fetched — try again shortly"],
        retryable: true,
        detail: body,
      });
    }
    throw new ApiError({
      kind: "unknown",
      status: res.status,
      title: "Couldn't fetch that video link",
      causes: [msg || `The server responded ${res.status}`],
      retryable: false,
      detail: body,
    });
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!/^video\//i.test(contentType)) {
    const body = await res.text().catch(() => "");
    throw new ApiError({
      kind: "unknown",
      title: "That link didn't return a video",
      causes: [body.slice(0, 200) || "The server didn't return video data"],
      retryable: false,
    });
  }

  const blob = await res.blob();
  const ext = /quicktime|\/mov/i.test(contentType) ? "mov" : "mp4";
  return new File([blob], `remote-clip.${ext}`, { type: blob.type || "video/mp4" });
}

export const analysisApi = {
  list: () => jsonFetch<{ analyses: AnalysisListItem[] }>("api/analysis"),
  get: (id: number, compareId?: number | null) => {
    const qs = compareId != null ? `?compareId=${compareId}` : "";
    return jsonFetch<{ analysis: VideoAnalysis }>(`api/analysis/${id}${qs}`);
  },
  create: (input: CreateAnalysisInput) =>
    jsonFetch<{ analysis: VideoAnalysis; modelUpdate?: AnalysisModelUpdate | null }>("api/analysis", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateNotes: (id: number, notes: Record<number, string>) =>
    jsonFetch<{ analysis: VideoAnalysis }>(`api/analysis/${id}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    }),
};

export type Competition = {
  id: number;
  fighterId: number;
  eventName: string;
  discipline: string;
  eventDate: string;
  weighInDate: string | null;
  targetWeight: string;
  currentWeight: string;
  opponent: string;
  promotion: string;
  weightClass: string;
  rounds: number | null;
  location: string;
  notes: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type PressureTier = "base" | "build" | "sharpen" | "peak" | "fight_week";

// Athlete-facing phase names, computed server-side. Five pressure tiers collapse
// into four phases (peak + fight_week both read as "Fight Week").
export type CampPhase = "Build" | "Develop" | "Sharpen" | "Fight Week";

export type CompetitionPressure = {
  competition: Competition;
  daysToEvent: number;
  daysToWeighIn: number | null;
  tier: PressureTier;
  tierLabel: string;
  phase: CampPhase;
};

// Honest weight-cut readout — derived only from the real target/current values.
// `status` is authoritative ("3kg to cut" | "On weight" | "Calibrating" | ...).
export type WeightCut = {
  current: string;
  target: string;
  currentNum: number | null;
  targetNum: number | null;
  unit: string | null;
  difference: number | null;
  status: string;
};

export const SESSION_TYPES = [
  "sparring",
  "wrestling",
  "bjj",
  "striking",
  "conditioning",
  "recovery",
  "mobility",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export type TrainingSessionSource = "manual" | "google_calendar";

export type TrainingSession = {
  id: number;
  campId: number;
  fighterId: number;
  sessionType: SessionType;
  sessionDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  durationMin: number | null;
  coach: string;
  objective: string;
  notes: string;
  completed: boolean;
  source: TrainingSessionSource;
  externalEventId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompetitionInput = {
  eventName: string;
  discipline?: string;
  eventDate: string; // YYYY-MM-DD
  weighInDate?: string | null; // YYYY-MM-DD | null
  targetWeight?: string;
  currentWeight?: string;
  opponent?: string;
  promotion?: string;
  weightClass?: string;
  rounds?: number | null;
  location?: string;
  notes?: string;
};

export type TrainingSessionInput = {
  sessionType: SessionType;
  sessionDate: string; // YYYY-MM-DD
  startTime?: string | null; // HH:MM
  durationMin?: number | null;
  coach?: string;
  objective?: string;
  notes?: string;
  completed?: boolean;
};

export type ActiveCompetition = {
  competition: Competition | null;
  pressure: CompetitionPressure | null;
  weightCut: WeightCut | null;
  sessions: TrainingSession[];
};

export const competitionApi = {
  active: () => jsonFetch<ActiveCompetition>("api/competition/active"),
  list: () => jsonFetch<{ competitions: Competition[] }>("api/competition"),
  create: (input: CompetitionInput) =>
    jsonFetch<{ competition: Competition }>("api/competition", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: number, input: Partial<CompetitionInput>) =>
    jsonFetch<{ competition: Competition }>(`api/competition/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  cancel: (id: number) =>
    jsonFetch<{ ok: true }>(`api/competition/${id}`, { method: "DELETE" }),
  listSessions: (campId: number) =>
    jsonFetch<{ sessions: TrainingSession[] }>(`api/competition/${campId}/sessions`),
  createSession: (campId: number, input: TrainingSessionInput) =>
    jsonFetch<{ session: TrainingSession }>(`api/competition/${campId}/sessions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateSession: (id: number, input: Partial<TrainingSessionInput>) =>
    jsonFetch<{ session: TrainingSession }>(`api/competition/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteSession: (id: number) =>
    jsonFetch<{ ok: true }>(`api/competition/sessions/${id}`, { method: "DELETE" }),
};

// ── Google Calendar (per-user two-way sync) ─────────────────────────────────

export type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  lastSyncedAt: string | null;
};

export type GoogleImportItem = {
  externalEventId: string;
  title: string;
  sessionDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  durationMin: number | null;
  suggestedType: SessionType;
};

export type GoogleApplyResult = { imported: number; exported: number };

export type GoogleApplyInput = {
  campId: number;
  timeZone: string;
  importItems: {
    externalEventId: string;
    sessionType: SessionType;
    sessionDate: string;
    startTime: string | null;
    durationMin: number | null;
    objective: string;
  }[];
  exportSessions: boolean;
};

export const googleApi = {
  status: () => jsonFetch<GoogleStatus>("api/google/status"),
  start: () =>
    jsonFetch<{ url: string }>("api/google/oauth/start", { method: "POST" }),
  disconnect: () =>
    jsonFetch<{ ok: true }>("api/google/connection", { method: "DELETE" }),
  preview: (campId: number, timeZone: string) =>
    jsonFetch<{ items: GoogleImportItem[] }>("api/google/sync/preview", {
      method: "POST",
      body: JSON.stringify({ campId, timeZone }),
    }),
  apply: (input: GoogleApplyInput) =>
    jsonFetch<GoogleApplyResult>("api/google/sync/apply", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  sparring: "Sparring",
  wrestling: "Wrestling",
  bjj: "BJJ",
  striking: "Striking",
  conditioning: "Conditioning",
  recovery: "Recovery",
  mobility: "Mobility",
};

// ── Daily readiness check-in (all values athlete-entered, one row per day) ──

export type DailyCheckin = {
  id: number;
  fighterId: number;
  checkinDate: string; // YYYY-MM-DD
  sleep: number;
  energy: number;
  soreness: number;
  stress: number;
  restingHr: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyCheckinInput = {
  sleep: number;
  energy: number;
  soreness: number;
  stress: number;
  restingHr?: number | null;
};

export const checkinApi = {
  today: () => jsonFetch<{ checkin: DailyCheckin | null; date: string }>("api/checkin/today"),
  // FRAME+ only — the server answers 402 fight_readiness for the free tier.
  history: () => jsonFetch<{ checkins: DailyCheckin[] }>("api/checkin/history"),
  save: (input: DailyCheckinInput) =>
    jsonFetch<{ checkin: DailyCheckin; date: string }>("api/checkin", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

// ── FRAME+ billing ──

export type PlanKey = "free" | "frame_plus";

export type Entitlement = {
  plan: PlanKey;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type BillingStatus = Entitlement & {
  price: { unitAmount: number; currency: string } | null;
};

export const billingApi = {
  status: () => jsonFetch<BillingStatus>("api/billing/status"),
  checkout: () =>
    jsonFetch<{ url: string }>("api/billing/checkout", { method: "POST" }),
  confirm: (sessionId: string) =>
    jsonFetch<Entitlement>("api/billing/confirm", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),
  portal: () =>
    jsonFetch<{ url: string }>("api/billing/portal", { method: "POST" }),
};

export const coachChatUrl = `${base}api/coach/chat`;
export const attachmentFileUrl = (id: number) => `${base}api/attachments/${id}/file`;
// Cache-busted with the fighter's updatedAt so a new upload shows immediately.
export const heroFileUrl = (cacheKey: string | number) =>
  `${base}api/fighter/hero/file?v=${encodeURIComponent(String(cacheKey))}`;
