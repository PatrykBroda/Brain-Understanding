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

export type ServerMessage = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type Conversation = {
  id: number;
  fighterId: number;
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
};

export const coachChatUrl = `${base}api/coach/chat`;
