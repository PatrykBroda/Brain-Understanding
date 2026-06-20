import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  weeklyPlansTable: {},
  weeklyPlanItemCompletionsTable: {},
  PLAN_CATEGORIES: ["fix", "train", "technique", "regulate", "goal_step"],
}));

vi.mock("../synochi", () => ({
  COACH_SYSTEM_PROMPT_STATIC: "static-prompt",
  buildDynamicContext: () => "dynamic-context",
}));

vi.mock("../vaultRetrieval", () => ({
  selectRelevantNodes: () => [],
}));

vi.mock("../openaiClient", () => ({
  openai: {},
  OPENAI_COACH_MODEL: "gpt-4o",
}));

const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function() {
    return { messages: { create: mockMessagesCreate } };
  }),
}));

import { validateAndNormalise, isoMondayUTC, generateWeeklyPlan } from "../lib/plannerService";

const VALID_FACT_IDS = new Set([1, 2, 3, 4, 5]);
const VALID_CAL_KEYS = new Set(["pre_roll_arousal", "fatigue_response", "chaos_tolerance"]);

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    category: "fix",
    title: "Tighten guard retention",
    detail: "Hold full guard without knee flaring for three rounds.",
    suggestedDays: "Mon, Wed",
    sourceFactIds: [1],
    sourceCalibrationKeys: [],
    sourceLabel: "guard flares under pressure (pattern)",
    ...overrides,
  };
}

function makeItems(count: number, overrides: Record<string, unknown> = {}) {
  const categories = ["fix", "train", "technique", "regulate", "goal_step"];
  return Array.from({ length: count }, (_, i) =>
    makeItem({ category: categories[i % categories.length], title: `Item ${i + 1}`, ...overrides }),
  );
}

function makeRawPlan(itemCount = 5, overrides: Record<string, unknown> = {}) {
  return {
    rationale: "This week is about guard retention and regulation.",
    items: makeItems(itemCount),
    ...overrides,
  };
}

describe("isoMondayUTC", () => {
  it("returns Monday for a Wednesday input", () => {
    const wed = new Date("2026-06-17T12:00:00Z");
    const mon = isoMondayUTC(wed);
    expect(mon.getUTCDay()).toBe(1);
    expect(mon.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("returns Monday for a Monday input unchanged", () => {
    const mon = new Date("2026-06-15T00:00:00Z");
    const result = isoMondayUTC(mon);
    expect(result.getUTCDay()).toBe(1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("returns the previous Monday for a Sunday input", () => {
    const sun = new Date("2026-06-21T00:00:00Z");
    const result = isoMondayUTC(sun);
    expect(result.getUTCDay()).toBe(1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("returns the previous Monday for a Saturday input", () => {
    const sat = new Date("2026-06-20T00:00:00Z");
    const result = isoMondayUTC(sat);
    expect(result.getUTCDay()).toBe(1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("always sets time to midnight UTC", () => {
    const thu = new Date("2026-06-18T23:59:59Z");
    const result = isoMondayUTC(thu);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });
});

describe("validateAndNormalise — structure guards", () => {
  it("rejects a non-object input", () => {
    const result = validateAndNormalise(null as unknown as never, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("error" in result).toBe(true);
  });

  it("rejects when items is not an array", () => {
    const result = validateAndNormalise(
      { rationale: "fine", items: "not-array" } as never,
      VALID_FACT_IDS,
      VALID_CAL_KEYS,
    );
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/not an array/);
  });
});

describe("validateAndNormalise — item count", () => {
  it("rejects fewer than 5 items", () => {
    const result = validateAndNormalise(makeRawPlan(4), VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/only 4 items/);
  });

  it("accepts exactly 5 items", () => {
    const result = validateAndNormalise(makeRawPlan(5), VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
  });

  it("accepts 7 items", () => {
    const result = validateAndNormalise(makeRawPlan(7), VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result) expect(result.items.length).toBe(7);
  });

  it("caps output at 7 items even when 9 are supplied", () => {
    const result = validateAndNormalise(makeRawPlan(9), VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result) expect(result.items.length).toBe(7);
  });
});

describe("validateAndNormalise — item category", () => {
  it("rejects an item with an invalid category", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).category = "made_up";
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/invalid category/);
  });

  it("rejects when fewer than 3 distinct categories appear across all items", () => {
    const raw = {
      rationale: "All fix items",
      items: Array.from({ length: 5 }, (_, i) =>
        makeItem({ category: i < 4 ? "fix" : "train", title: `Item ${i + 1}` }),
      ),
    };
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/distinct categories/);
  });

  it("accepts exactly 3 distinct categories", () => {
    const raw = {
      rationale: "three categories",
      items: [
        makeItem({ category: "fix", title: "Item 1" }),
        makeItem({ category: "train", title: "Item 2" }),
        makeItem({ category: "technique", title: "Item 3" }),
        makeItem({ category: "fix", title: "Item 4" }),
        makeItem({ category: "train", title: "Item 5" }),
      ],
    };
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
  });
});

describe("validateAndNormalise — source citation", () => {
  it("rejects an item with no valid fact id and no valid calibration key", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).sourceFactIds = [999];
    (raw.items[0] as Record<string, unknown>).sourceCalibrationKeys = ["unknown_key"];
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/no valid source fact id or calibration key/);
  });

  it("accepts an item citing only a valid fact id", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).sourceCalibrationKeys = [];
    (raw.items[0] as Record<string, unknown>).sourceFactIds = [1];
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
  });

  it("accepts an item citing only a valid calibration key", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).sourceFactIds = [];
    (raw.items[0] as Record<string, unknown>).sourceCalibrationKeys = ["pre_roll_arousal"];
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
  });

  it("silently drops invalid fact ids but keeps valid ones", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).sourceFactIds = [999, 1, 888];
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result) expect(result.items[0]!.sourceFactIds).toEqual([1]);
  });

  it("silently drops invalid calibration keys but keeps valid ones", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).sourceFactIds = [];
    (raw.items[0] as Record<string, unknown>).sourceCalibrationKeys = [
      "invented_key",
      "pre_roll_arousal",
    ];
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result)
      expect(result.items[0]!.sourceCalibrationKeys).toEqual(["pre_roll_arousal"]);
  });
});

describe("validateAndNormalise — field normalisation", () => {
  it("preserves rationale string", () => {
    const raw = makeRawPlan(5);
    raw.rationale = "Focus on guard this week.";
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result) expect(result.rationale).toBe("Focus on guard this week.");
  });

  it("truncates titles longer than 80 characters", () => {
    const longTitle = "A".repeat(100);
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).title = longTitle;
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result) expect(result.items[0]!.title.length).toBe(80);
  });

  it("truncates detail longer than 480 characters", () => {
    const longDetail = "B".repeat(500);
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).detail = longDetail;
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result) expect(result.items[0]!.detail.length).toBe(480);
  });

  it("defaults suggestedDays to 'Any' when missing", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).suggestedDays = "";
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result) expect(result.items[0]!.suggestedDays).toBe("Any");
  });

  it("generates a fallback sourceLabel from factIds when sourceLabel is empty", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).sourceLabel = "";
    (raw.items[0] as Record<string, unknown>).sourceFactIds = [2];
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result) expect(result.items[0]!.sourceLabel).toBe("fact #2");
  });

  it("generates a fallback sourceLabel from calibration key when no factIds", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).sourceLabel = "";
    (raw.items[0] as Record<string, unknown>).sourceFactIds = [];
    (raw.items[0] as Record<string, unknown>).sourceCalibrationKeys = ["fatigue_response"];
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("items" in result).toBe(true);
    if ("items" in result) expect(result.items[0]!.sourceLabel).toBe("calibration: fatigue_response");
  });

  it("rejects an item with empty title", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).title = "";
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/missing title\/detail/);
  });

  it("rejects an item with empty detail", () => {
    const raw = makeRawPlan(5);
    (raw.items[0] as Record<string, unknown>).detail = "";
    const result = validateAndNormalise(raw, VALID_FACT_IDS, VALID_CAL_KEYS);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/missing title\/detail/);
  });
});

describe("generateWeeklyPlan — retry logic", () => {
  const baseFighter = {
    id: 1,
    userId: "user_1",
    name: "Test Fighter",
    goals: "Improve guard",
    weaknesses: "Guard retention",
    belt: "blue",
    level: "intermediate",
    age: 28,
    dateOfBirth: "1998-01-01",
    heightCm: 180,
    weightKg: 80,
    gym: "Test Gym",
    primarySport: "bjj",
    archetype: null,
    personality: null,
    trainingFrequency: null,
    vocabularyLevel: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Parameters<typeof generateWeeklyPlan>[0]["fighter"];

  const facts = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] as Parameters<
    typeof generateWeeklyPlan
  >[0]["facts"];

  const calibrations = [
    { promptKey: "pre_roll_arousal" },
    { promptKey: "fatigue_response" },
    { promptKey: "chaos_tolerance" },
  ] as Parameters<typeof generateWeeklyPlan>[0]["calibrations"];

  function makeValidToolResponse() {
    return {
      content: [
        {
          type: "tool_use",
          name: "emit_weekly_plan",
          input: makeRawPlan(5),
        },
      ],
    };
  }

  function makeInvalidToolResponse() {
    return {
      content: [
        {
          type: "tool_use",
          name: "emit_weekly_plan",
          input: { rationale: "bad", items: [] },
        },
      ],
    };
  }

  beforeEach(() => {
    mockMessagesCreate.mockReset();
  });

  it("succeeds on the first attempt when the plan is valid", async () => {
    mockMessagesCreate.mockResolvedValueOnce(makeValidToolResponse());

    const result = await generateWeeklyPlan({
      fighter: baseFighter,
      facts,
      calibrations,
      provider: "claude",
      recentChat: "",
    });

    expect(result.items.length).toBeGreaterThanOrEqual(5);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it("retries once when the first attempt returns an invalid plan, succeeds on second", async () => {
    mockMessagesCreate
      .mockResolvedValueOnce(makeInvalidToolResponse())
      .mockResolvedValueOnce(makeValidToolResponse());

    const result = await generateWeeklyPlan({
      fighter: baseFighter,
      facts,
      calibrations,
      provider: "claude",
      recentChat: "",
    });

    expect(result.items.length).toBeGreaterThanOrEqual(5);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
  });

  it("throws after two consecutive invalid plans (refuses on second failure)", async () => {
    mockMessagesCreate
      .mockResolvedValueOnce(makeInvalidToolResponse())
      .mockResolvedValueOnce(makeInvalidToolResponse());

    await expect(
      generateWeeklyPlan({
        fighter: baseFighter,
        facts,
        calibrations,
        provider: "claude",
        recentChat: "",
      }),
    ).rejects.toThrow(/planner validation failed twice/);

    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
  });

  it("throws immediately if claude returns no tool_use block", async () => {
    mockMessagesCreate.mockResolvedValueOnce({ content: [] });

    await expect(
      generateWeeklyPlan({
        fighter: baseFighter,
        facts,
        calibrations,
        provider: "claude",
        recentChat: "",
      }),
    ).rejects.toThrow(/no tool_use/);
  });
});
