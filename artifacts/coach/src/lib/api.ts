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
  heightCm: number | null;
  weightKg: number | null;
  goals: string;
  weaknesses: string;
  competes: boolean;
  personality: string;
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
  heightCm?: number | null;
  weightKg?: number | null;
  goals: string;
  weaknesses: string;
  competes: boolean;
  personality: string;
};

export type FighterUpdate = Partial<FighterInput>;

export type FactCategory =
  | "strength"
  | "weakness"
  | "technical_knowledge"
  | "pattern"
  | "preference"
  | "event"
  | "goal"
  | "context";

export type AthleteFact = {
  id: number;
  fighterId: number;
  category: FactCategory;
  topic: string;
  content: string;
  confidence: number;
  status: "active" | "superseded" | "resolved";
  source: string;
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
  | "server"
  | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  title: string;
  causes: string[];
  retryable: boolean;
  detail: string;

  constructor(opts: {
    kind: ApiErrorKind;
    status?: number | null;
    title: string;
    causes: string[];
    retryable: boolean;
    detail?: string;
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
const REQUEST_TIMEOUT_MS = 90_000;

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
  nervousSystemLoad: NervousSystemLoad;
  sessionScore: number;
  styleProfile: string;
  summary: string;
  durationSec: number;
  createdAt: string;
  scores: AnalysisScore[];
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

export const analysisApi = {
  list: () => jsonFetch<{ analyses: AnalysisListItem[] }>("api/analysis"),
  get: (id: number, compareId?: number | null) => {
    const qs = compareId != null ? `?compareId=${compareId}` : "";
    return jsonFetch<{ analysis: VideoAnalysis }>(`api/analysis/${id}${qs}`);
  },
  create: (input: CreateAnalysisInput) =>
    jsonFetch<{ analysis: VideoAnalysis }>("api/analysis", {
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
  notes: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type PressureTier = "base" | "build" | "sharpen" | "peak" | "fight_week";

export type CompetitionPressure = {
  competition: Competition;
  daysToEvent: number;
  daysToWeighIn: number | null;
  tier: PressureTier;
  tierLabel: string;
};

export type CompetitionInput = {
  eventName: string;
  discipline?: string;
  eventDate: string;
  weighInDate?: string | null;
  targetWeight?: string;
  currentWeight?: string;
  notes?: string;
};

export const competitionApi = {
  active: () =>
    jsonFetch<{ competition: Competition | null; pressure: CompetitionPressure | null }>(
      "api/competition/active",
    ),
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
};

export const coachChatUrl = `${base}api/coach/chat`;
export const attachmentFileUrl = (id: number) => `${base}api/attachments/${id}/file`;
