// Lightweight readiness modifier read from the athlete's own recent chat.
//
// This is NOT a new score. It's a small ±10 adjustment layered on top of the
// existing Fight Readiness number (today's check-in composite, else the last
// session score). It only moves the needle when the athlete has said something
// clear and recent about one of six readiness dimensions — sleep, fatigue,
// stress, recovery, confidence, training quality. With no clear evidence the
// modifier is exactly 0 and readiness is unchanged.
//
// Phrases are intentionally intent-clear (mostly multi-word) so we sidestep the
// negation ambiguity of bare keywords. Only `role === "user"` messages are read
// — the coach's replies never influence the athlete's own readiness.
//
// Web mirror of frame-mobile/lib/readinessModifier.ts — kept identical so the
// Fight Readiness number matches across the native and web surfaces.

export interface ChatMessageLike {
  role: string;
  content: string;
}

interface Dimension {
  positive: RegExp;
  negative: RegExp;
}

// One net signal per dimension, so a single talkative dimension can't dominate.
const DIMENSIONS: Dimension[] = [
  {
    // Sleep
    positive: /\b(slept (well|great|solid)|well[-\s]?rested|good (night'?s )?sleep|full night'?s sleep|out like a light)\b/,
    negative: /\b(didn'?t sleep|couldn'?t sleep|barely slept|no sleep|hardly slept|bad sleep|slept (badly|terribly|awful)|insomnia|up all night|restless night|tossed and turned)\b/,
  },
  {
    // Fatigue / energy
    positive: /\b(full of energy|feeling fresh|so fresh|energi[sz]ed|loads of energy|feeling strong|good energy)\b/,
    negative: /\b(exhausted|drained|running on empty|burnt? out|wiped out|no energy|dead tired|so tired|shattered|knackered|fatigued)\b/,
  },
  {
    // Stress
    positive: /\b(feeling calm|really calm|so relaxed|clear[-\s]?headed|no stress|stress[-\s]?free|at ease)\b/,
    negative: /\b(so stressed|really stressed|stressed out|anxious|overwhelmed|on edge|can'?t switch off|too much pressure|freaking out|panicking)\b/,
  },
  {
    // Recovery / soreness / injury
    positive: /\b(fully recovered|feeling recovered|no soreness|not sore|feeling loose|body feels good|niggles gone)\b/,
    negative: /\b(so sore|really sore|banged up|beat up|stiff|aching|tweaked|injured|hurt my|niggle|not recovered|still sore)\b/,
  },
  {
    // Confidence
    positive: /\b(feeling confident|so confident|feeling sharp|dialed in|dialled in|locked in|feeling ready|feeling good about)\b/,
    negative: /\b(not confident|no confidence|full of doubt|self[-\s]?doubt|feeling nervous|feeling flat|feeling scared|unsure of myself|second[-\s]?guessing)\b/,
  },
  {
    // Training quality
    positive: /\b(great session|best session|crushed it|felt strong|clean reps|sharp today|moving well|good training|trained well)\b/,
    negative: /\b(bad session|rough session|terrible training|sloppy|off today|couldn'?t focus|gassed|felt slow|flat session|nothing was landing)\b/,
  },
];

const RECENT_MESSAGE_LIMIT = 12; // "recent" chat — the athlete's last dozen turns
const PER_DIMENSION_POINTS = 2; // each clear dimension is worth ±2
const CAP = 10; // hard ±10 ceiling per the spec

/**
 * Derive a bounded readiness modifier from recent chat. Returns an integer in
 * [-10, 10]; 0 when there isn't enough clear evidence.
 */
export function readinessModifier(messages: ChatMessageLike[]): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0;

  const recentUserText = messages
    .filter((m) => m && m.role === "user" && typeof m.content === "string")
    .slice(-RECENT_MESSAGE_LIMIT)
    .map((m) => m.content.toLowerCase())
    .join("\n");

  if (!recentUserText.trim()) return 0;

  let raw = 0;
  for (const dim of DIMENSIONS) {
    const pos = dim.positive.test(recentUserText);
    const neg = dim.negative.test(recentUserText);
    // Net per dimension: mixed signals cancel to 0, so we never double-count.
    const net = (pos ? 1 : 0) - (neg ? 1 : 0);
    raw += net * PER_DIMENSION_POINTS;
  }

  return Math.max(-CAP, Math.min(CAP, raw));
}

/**
 * Apply the modifier to a base readiness score, clamped to a valid 0-100 range.
 * When there's no base score we return null unchanged — the modifier never
 * fabricates a readiness number out of nothing.
 */
export function applyReadinessModifier(
  base: number | null,
  modifier: number,
): number | null {
  if (base == null) return null;
  return Math.max(0, Math.min(100, base + modifier));
}
