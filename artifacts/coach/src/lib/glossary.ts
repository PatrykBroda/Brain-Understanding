// Curated plain-English glossary for tap-to-simplify. Deterministic and honest:
// we only ever simplify terms we have an actual definition for. Keys are matched
// case-insensitively against whole words in coach output.
//
// Three layers per entry, surfaced progressively in the popover:
//   quick — one-line plain-English definition (always present)
//   why   — why it matters to a fighter (optional "Learn more")
//   train — a prompt the athlete can send the coach to train it (optional "Train this")
export type GlossEntry = {
  quick: string;
  why?: string;
  train?: string;
};

export const GLOSSARY: Record<string, GlossEntry> = {
  "vagal tone": {
    quick: "How strong your body's calm-down brake is. Higher = you settle faster after stress.",
    why: "Strong vagal tone lets you drop your heart rate between exchanges and recover faster between rounds — it's the physiology behind staying composed under pressure.",
    train: "How do I build my vagal tone for faster recovery between rounds?",
  },
  "vagal": {
    quick: "To do with the nerve that controls your calm-down response.",
  },
  "parasympathetic": {
    quick: "The 'rest and recover' side of your nervous system — the brake pedal.",
    why: "You win the recovery game in the parasympathetic state — it's where your body refuels and your mind clears between efforts.",
    train: "How do I switch into a parasympathetic state on demand after a hard round?",
  },
  "sympathetic": {
    quick: "The 'fight or flight' side of your nervous system — the gas pedal.",
    why: "Too much sympathetic drive too early burns your gas tank and narrows your decision-making — learning to dose it is a skill.",
  },
  "cortisol": {
    quick: "The main stress hormone. Useful in short bursts, draining when it stays high.",
    why: "Chronically high cortisol wrecks sleep, recovery and mood — it's often the hidden reason a hard training block stops paying off.",
  },
  "nervous system": {
    quick: "The body's wiring that controls stress, calm, focus and reactions.",
  },
  "autonomic": {
    quick: "Automatic body functions you don't consciously control (heart rate, breathing).",
  },
  "homeostasis": {
    quick: "Your body's natural balanced resting state.",
  },
  "regulation": {
    quick: "Bringing your stress level back down to a workable range on purpose.",
    why: "Regulation is the trainable skill underneath composure — it's the difference between riding a pressure spike and getting swept away by it.",
    train: "Give me a regulation protocol I can use mid-session when I feel myself spiking.",
  },
  "dysregulation": {
    quick: "When your stress response is stuck too high or too low to perform well.",
    why: "Dysregulation is where technique falls apart — you stop reading the situation and start reacting blindly.",
  },
  "aftershock": {
    quick: "The drained, rattled feeling that lingers after a hard or emotional round.",
    why: "Unmanaged aftershock bleeds into your next round and your recovery — naming it lets you shorten it on purpose.",
    train: "How do I shorten the aftershock after a brutal round so I'm ready for the next one?",
  },
  "composure": {
    quick: "Staying calm and clear-headed while under pressure.",
    why: "Composure is what keeps your skills available when it gets hard — without it, everything you drilled goes offline.",
    train: "Build me a drill that trains composure under pressure.",
  },
  "containment": {
    quick: "Keeping your reaction small instead of overreacting to a threat.",
    why: "Over-reacting to a feint or a grip wastes energy and opens you up — containment keeps your response proportional.",
  },
  "threat sensitivity": {
    quick: "How quickly you perceive danger — too high means you panic early.",
    why: "Mis-calibrated threat sensitivity makes you flinch at nothing or miss the real attack — tuning it is a core composure skill.",
  },
  "buffer zone": {
    quick: "The space and time you keep between you and a threat before reacting.",
    why: "A good buffer zone buys you the half-second to read and respond instead of react — collapse it and you're always late.",
  },
  "approach velocity": {
    quick: "How fast you close distance or commit — too fast gets you caught.",
    why: "Controlling approach velocity is how you enter without getting countered — it's pacing applied to distance.",
  },
  "axis control": {
    quick: "Controlling the centre line your opponent rotates around.",
    why: "Whoever owns the axis dictates the exchange — it's the structural root of most dominant positions.",
    train: "Teach me a drill for taking axis control from a neutral position.",
  },
  "directional compression": {
    quick: "Applying pressure in one clear direction instead of scattered effort.",
    why: "Scattered pressure is easy to escape; compression in one direction is what actually pins and breaks structure.",
  },
  "posture": {
    quick: "Your structural alignment — staying strong and stacked instead of folded.",
    why: "Lose posture and you lose power and defence at the same time — most submissions and finishes start with broken posture.",
  },
  "frame": {
    quick: "Using your limbs as rigid structures to block, create space, or hold position.",
    why: "Frames let you defend and create space without spending energy muscling — they're how small details beat strength.",
  },
  "frame integrity": {
    quick: "Whether your structure and composure hold up under pressure or collapse.",
    why: "Frame integrity is the whole product in one phrase — how much of you survives when the pressure spikes.",
  },
  "guard retention": {
    quick: "Keeping your guard (legs between you and them) when they try to pass.",
    train: "Build me a guard retention drill for when someone is passing fast.",
  },
  "guard passing": {
    quick: "Getting past someone's legs to a dominant position.",
  },
  "half-guard": {
    quick: "A position where you trap one of their legs between yours.",
  },
  "deep half": {
    quick: "A half-guard variation where you slide deep underneath their hips.",
  },
  "isometric": {
    quick: "Holding a muscle tense without moving — pushing against something immovable.",
  },
  "proprioception": {
    quick: "Your sense of where your body parts are without looking.",
  },
  "interoception": {
    quick: "Your sense of what's happening inside your body (heartbeat, tension, breath).",
    why: "Good interoception is the early-warning system for your own state — it's how you catch a spike before it owns you.",
  },
  "tilt": {
    quick: "Losing emotional control and making worse decisions because of it.",
    why: "Tilt compounds — one bad exchange becomes three because the emotion is driving, not the gameplan.",
    train: "How do I catch myself tilting and reset before it spirals?",
  },
  "leakage": {
    quick: "Stress or emotion slipping out and degrading your performance.",
  },
  "decompression": {
    quick: "Winding down and releasing tension after a hard session.",
    train: "Give me a decompression routine for after a hard session.",
  },
  "deload": {
    quick: "A planned easier period to let your body and nerves recover.",
    why: "Skipping deloads is how committed athletes stall — recovery is when the adaptation actually happens.",
  },
  "gas tank": {
    quick: "Your cardio and energy reserve over a roll or match.",
    why: "Most technical games fall apart when the gas tank empties — conditioning protects everything else you've built.",
  },
};

// Multi-word keys first so longer phrases match before their sub-words.
export const GLOSSARY_KEYS = Object.keys(GLOSSARY).sort(
  (a, b) => b.length - a.length,
);
