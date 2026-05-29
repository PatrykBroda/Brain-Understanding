// Curated plain-English glossary for tap-to-simplify. Deterministic and honest:
// we only ever simplify terms we have an actual definition for. Keys are matched
// case-insensitively against whole words in coach output.
export const GLOSSARY: Record<string, string> = {
  "vagal tone":
    "How strong your body's calm-down brake is. Higher = you settle faster after stress.",
  "vagal":
    "To do with the nerve that controls your calm-down response.",
  "parasympathetic":
    "The 'rest and recover' side of your nervous system — the brake pedal.",
  "sympathetic":
    "The 'fight or flight' side of your nervous system — the gas pedal.",
  "cortisol":
    "The main stress hormone. Useful in short bursts, draining when it stays high.",
  "nervous system":
    "The body's wiring that controls stress, calm, focus and reactions.",
  "autonomic":
    "Automatic body functions you don't consciously control (heart rate, breathing).",
  "homeostasis":
    "Your body's natural balanced resting state.",
  "regulation":
    "Bringing your stress level back down to a workable range on purpose.",
  "dysregulation":
    "When your stress response is stuck too high or too low to perform well.",
  "aftershock":
    "The drained, rattled feeling that lingers after a hard or emotional round.",
  "composure":
    "Staying calm and clear-headed while under pressure.",
  "containment":
    "Keeping your reaction small instead of overreacting to a threat.",
  "threat sensitivity":
    "How quickly you perceive danger — too high means you panic early.",
  "buffer zone":
    "The space and time you keep between you and a threat before reacting.",
  "approach velocity":
    "How fast you close distance or commit — too fast gets you caught.",
  "axis control":
    "Controlling the centre line your opponent rotates around.",
  "directional compression":
    "Applying pressure in one clear direction instead of scattered effort.",
  "posture":
    "Your structural alignment — staying strong and stacked instead of folded.",
  "frame":
    "Using your limbs as rigid structures to block, create space, or hold position.",
  "frame integrity":
    "Whether your structure and composure hold up under pressure or collapse.",
  "guard retention":
    "Keeping your guard (legs between you and them) when they try to pass.",
  "guard passing":
    "Getting past someone's legs to a dominant position.",
  "half-guard":
    "A position where you trap one of their legs between yours.",
  "deep half":
    "A half-guard variation where you slide deep underneath their hips.",
  "isometric":
    "Holding a muscle tense without moving — pushing against something immovable.",
  "proprioception":
    "Your sense of where your body parts are without looking.",
  "interoception":
    "Your sense of what's happening inside your body (heartbeat, tension, breath).",
  "tilt":
    "Losing emotional control and making worse decisions because of it.",
  "leakage":
    "Stress or emotion slipping out and degrading your performance.",
  "decompression":
    "Winding down and releasing tension after a hard session.",
  "deload":
    "A planned easier period to let your body and nerves recover.",
  "gas tank":
    "Your cardio and energy reserve over a roll or match.",
};

// Multi-word keys first so longer phrases match before their sub-words.
export const GLOSSARY_KEYS = Object.keys(GLOSSARY).sort(
  (a, b) => b.length - a.length,
);
