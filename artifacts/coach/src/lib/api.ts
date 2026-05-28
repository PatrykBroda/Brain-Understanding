const base = import.meta.env.BASE_URL;

export type Fighter = {
  id: number;
  name: string;
  age: number;
  art: string;
  level: string;
  trainingFrequency: string;
  goals: string;
  weaknesses: string;
  competes: boolean;
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

export type FighterInput = Omit<Fighter, "id" | "createdAt" | "updatedAt">;

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

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${txt}`);
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

export const coachChatUrl = `${base}api/coach/chat`;
export const attachmentFileUrl = (id: number) => `${base}api/attachments/${id}/file`;
