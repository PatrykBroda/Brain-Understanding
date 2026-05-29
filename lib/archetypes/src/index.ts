// Canonical FRAME identity mythology — shared by the API (coach prompt + spirit
// animal assignment) and the coach app (onboarding, profile, belt). One source
// of truth so the two never drift.

export type Archetype = {
  key: string;
  name: string;
  // One-line read used when sizing a fighter up.
  essence: string;
  // What this fighter BECOMES when pressure spikes — the combat-identity hook.
  pressureSignature: string;
  // The gift the archetype is built around.
  gift: string;
  // The failure mode that breaks them when the gift is overplayed.
  shadow: string;
};

export const ARCHETYPES = [
  {
    key: "wolf",
    name: "Wolf",
    essence: "relentless pressure, chains attacks, never lets the pace drop",
    pressureSignature: "You hunt harder. Pressure makes you press — you close distance and chain until something gives.",
    gift: "Relentless pace. You break wills by never letting the exchange settle.",
    shadow: "When the chase stops working you keep chasing — and gas, or run onto a counter.",
  },
  {
    key: "falcon",
    name: "Falcon",
    essence: "precise and fast, strikes from sharp angles, hunts openings",
    pressureSignature: "You sharpen. Under pressure you go quiet and wait for the angle, then take it clean.",
    gift: "Precision timing. You hit the one window most people never see.",
    shadow: "Waiting too long for the perfect shot — you let winnable exchanges pass by.",
  },
  {
    key: "bear",
    name: "Bear",
    essence: "heavy and immovable, smothering top pressure, grinds people down",
    pressureSignature: "You get heavier. Pressure makes you settle weight and smother — you slow the whole fight to your pace.",
    gift: "Crushing top control. You make every second cost them something.",
    shadow: "Stalling on control instead of finishing — and getting flat when the pace forces you to move.",
  },
  {
    key: "cobra",
    name: "Cobra",
    essence: "patient and baiting, sits still then explodes into the finish",
    pressureSignature: "You go still. Pressure makes you bait — you give a target, wait, and detonate on the reaction.",
    gift: "Trap timing. The strike lands before they know it started.",
    shadow: "Sitting in the trap too long — passivity reads as hesitation when the bait never gets taken.",
  },
  {
    key: "panther",
    name: "Panther",
    essence: "silent, fluid, deceptive — ambushes and slips frames",
    pressureSignature: "You disappear and reappear. Pressure makes you flow off-line and ambush from the blind side.",
    gift: "Deceptive movement. They commit to where you were, not where you are.",
    shadow: "Movement for its own sake — slipping when you should plant and finish.",
  },
  {
    key: "ox",
    name: "Ox",
    essence: "endurance and forward walk, outlasts and breaks the will",
    pressureSignature: "You walk forward. Pressure makes you turn it into a war of attrition you intend to win late.",
    gift: "Bottomless engine. You're still coming in round three when they're done.",
    shadow: "Trading on toughness instead of skill — eating damage you didn't need to take.",
  },
  {
    key: "shark",
    name: "Shark",
    essence: "constant forward pressure, smells fatigue and swarms it",
    pressureSignature: "You smell blood. The moment they tire you swarm — pressure flips you from patient to all-out.",
    gift: "Finishing instinct. You sense the fade and end it before it recovers.",
    shadow: "Over-committing to the kill — swarming early onto someone who isn't actually hurt.",
  },
  {
    key: "eagle",
    name: "Eagle",
    essence: "vision and control, manages range and distance, sees two moves ahead",
    pressureSignature: "You rise above it. Pressure makes you manage range and read the pattern instead of reacting to it.",
    gift: "Fight IQ. You're already two exchanges ahead of the position.",
    shadow: "Managing the fight from distance so long you never impose — control without threat.",
  },
  {
    key: "mantis",
    name: "Mantis",
    essence: "technical trap-setter, builds frames and angles, springs the snare",
    pressureSignature: "You build structure. Pressure makes you frame, angle, and engineer the snare one piece at a time.",
    gift: "Technical traps. Everything is a setup for the thing three steps later.",
    shadow: "Over-engineering — building a perfect structure while the simple finish was right there.",
  },
  {
    key: "ram",
    name: "Ram",
    essence: "head-on collision, pure will, walks through the storm",
    pressureSignature: "You lower your head. Pressure makes you collide — straight line, full commitment, through the middle.",
    gift: "Pure will. You walk through what stops other people.",
    shadow: "Meeting force with force when angling would win — running headfirst into the counter.",
  },
] as const satisfies readonly Archetype[];

export type ArchetypeKey = (typeof ARCHETYPES)[number]["key"];

const BY_KEY = new Map<string, Archetype>(ARCHETYPES.map((a) => [a.key, a]));

export function isArchetypeKey(v: string): v is ArchetypeKey {
  return BY_KEY.has(v);
}

export function getArchetype(key: string): Archetype | null {
  return BY_KEY.get(key) ?? null;
}

export function archetypeName(key: string): string {
  return BY_KEY.get(key)?.name ?? "";
}

// FRAME's psychological reinterpretation of the BJJ belt ladder. The rank is not
// about technique catalogues — it's about how the nervous system behaves under load.
export type BeltMeaning = {
  key: string;
  label: string;
  // The short, punchy state name for this rank.
  state: string;
  // What that actually means, in one line.
  meaning: string;
};

export const BELT_PSYCHOLOGY = [
  {
    key: "white",
    label: "White belt",
    state: "Chaotic movement",
    meaning: "Reactions fire faster than thought. Energy leaks everywhere — pure survival.",
  },
  {
    key: "blue",
    label: "Blue belt",
    state: "Beginning awareness",
    meaning: "You start to see the pattern mid-exchange. Composure flickers on, then off.",
  },
  {
    key: "purple",
    label: "Purple belt",
    state: "Adaptive under pressure",
    meaning: "You adjust while it's happening. Pressure stops dictating and starts informing.",
  },
  {
    key: "brown",
    label: "Brown belt",
    state: "Composed under fatigue",
    meaning: "The frame holds when the tank empties. Tired no longer means scattered.",
  },
  {
    key: "black",
    label: "Black belt",
    state: "Stable under fragmentation",
    meaning: "When everything breaks, you don't. Structure survives chaos — and imposes it.",
  },
] as const satisfies readonly BeltMeaning[];

export type BeltKey = (typeof BELT_PSYCHOLOGY)[number]["key"];

export const BELT_ORDER: readonly BeltKey[] = BELT_PSYCHOLOGY.map((b) => b.key);

export function beltKeyOf(level: string): BeltKey | null {
  const l = level.toLowerCase();
  for (const b of BELT_PSYCHOLOGY) {
    if (l.startsWith(b.key)) return b.key;
  }
  return null;
}

export function beltMeaning(key: string): BeltMeaning | null {
  return BELT_PSYCHOLOGY.find((b) => b.key === key) ?? null;
}
