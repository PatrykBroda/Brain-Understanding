import { Router, type IRouter } from "express";
import {
  db,
  videoAnalysesTable,
  type AnalysisKeyframe,
  type AnalysisMetrics,
  type AnalysisSignal,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import { getActiveFacts, addFact } from "../lib/factsService";
import { generateAnalysis, isValidKind, isValidLoad } from "../lib/analysisService";

const router: IRouter = Router();

const MAX_KEYFRAMES = 6;
const MAX_KEYFRAME_BYTES = 600_000; // ~600KB of base64 per frame ceiling

function sanitiseSignals(input: unknown): AnalysisSignal[] {
  if (!Array.isArray(input)) return [];
  const out: AnalysisSignal[] = [];
  for (const s of input.slice(0, 24)) {
    const it = s as Record<string, unknown>;
    const key = typeof it["key"] === "string" ? it["key"] : "";
    const label = typeof it["label"] === "string" ? it["label"] : "";
    const value = typeof it["value"] === "string" ? it["value"] : "";
    const detail = typeof it["detail"] === "string" ? it["detail"] : "";
    if (!key || !label) continue;
    out.push({
      key: key.slice(0, 60),
      label: label.slice(0, 80),
      value: value.slice(0, 80),
      detail: detail.slice(0, 240),
    });
  }
  return out;
}

function sanitiseKeyframes(input: unknown): AnalysisKeyframe[] {
  if (!Array.isArray(input)) return [];
  const out: AnalysisKeyframe[] = [];
  for (const k of input.slice(0, MAX_KEYFRAMES)) {
    const it = k as Record<string, unknown>;
    const img = typeof it["imageBase64"] === "string" ? it["imageBase64"] : "";
    if (!img || img.length > MAX_KEYFRAME_BYTES) continue;
    out.push({
      timestamp: typeof it["timestamp"] === "number" && Number.isFinite(it["timestamp"]) ? it["timestamp"] : 0,
      imageBase64: img,
      caption: (typeof it["caption"] === "string" ? it["caption"] : "").slice(0, 200),
    });
  }
  return out;
}

router.post("/analysis", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter — complete onboarding first" });
    return;
  }

  const body = req.body as {
    kind?: unknown;
    load?: unknown;
    loadBasis?: unknown;
    durationSec?: unknown;
    framesAnalysed?: unknown;
    poseFrames?: unknown;
    signals?: unknown;
    keyframes?: unknown;
  };

  if (!isValidKind(body.kind)) {
    res.status(400).json({ error: "invalid or missing kind" });
    return;
  }
  if (!isValidLoad(body.load)) {
    res.status(400).json({ error: "invalid or missing load" });
    return;
  }

  const signals = sanitiseSignals(body.signals);
  const keyframes = sanitiseKeyframes(body.keyframes);
  if (signals.length === 0) {
    res.status(400).json({ error: "no movement signals — could not read a pose from this clip" });
    return;
  }

  const durationSec =
    typeof body.durationSec === "number" && Number.isFinite(body.durationSec) ? body.durationSec : 0;

  const metrics: AnalysisMetrics = {
    framesAnalysed:
      typeof body.framesAnalysed === "number" && Number.isFinite(body.framesAnalysed)
        ? Math.round(body.framesAnalysed)
        : 0,
    poseFrames:
      typeof body.poseFrames === "number" && Number.isFinite(body.poseFrames)
        ? Math.round(body.poseFrames)
        : 0,
    durationSec,
    loadBasis: typeof body.loadBasis === "string" ? body.loadBasis.slice(0, 240) : "",
    signals,
  };

  try {
    const facts = await getActiveFacts(fighter.id);
    const { summary, findings } = await generateAnalysis({
      fighter,
      facts,
      kind: body.kind,
      load: body.load,
      metrics,
      keyframes,
    });

    const [row] = await db
      .insert(videoAnalysesTable)
      .values({
        fighterId: fighter.id,
        kind: body.kind,
        nervousSystemLoad: body.load,
        summary,
        findings,
        metrics,
        keyframes,
        durationSec,
      })
      .returning();

    if (row) {
      // Feed the model: each high/medium finding becomes a low-confidence pattern fact
      // sourced to this analysis so it informs future coaching without overweighting.
      for (const f of findings) {
        if (f.severity === "low") continue;
        await addFact(fighter.id, {
          category: f.severity === "high" ? "weakness" : "pattern",
          topic: `${body.kind}: ${f.title}`.slice(0, 120),
          content: `${f.observation} ${f.nervousSystemFraming}`.trim().slice(0, 600),
          confidence: 2,
          source: `video:${row.id}`,
        }).catch((err) => req.log.error({ err }, "analysis fact write failed"));
      }
    }

    res.json({ analysis: row });
  } catch (err) {
    req.log.error({ err }, "analysis generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "analysis failed" });
  }
});

router.get("/analysis", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ analyses: [] });
    return;
  }
  const rows = await db
    .select({
      id: videoAnalysesTable.id,
      kind: videoAnalysesTable.kind,
      nervousSystemLoad: videoAnalysesTable.nervousSystemLoad,
      summary: videoAnalysesTable.summary,
      durationSec: videoAnalysesTable.durationSec,
      createdAt: videoAnalysesTable.createdAt,
    })
    .from(videoAnalysesTable)
    .where(eq(videoAnalysesTable.fighterId, fighter.id))
    .orderBy(desc(videoAnalysesTable.createdAt))
    .limit(20);
  res.json({ analyses: rows });
});

router.get("/analysis/:id", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad id" });
    return;
  }
  const [row] = await db
    .select()
    .from(videoAnalysesTable)
    .where(eq(videoAnalysesTable.id, id))
    .limit(1);
  if (!row || row.fighterId !== fighter.id) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ analysis: row });
});

export default router;
