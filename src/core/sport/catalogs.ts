// Deep-freezes at runtime while keeping the literal tuple type.
function catalog<const T extends readonly object[]>(entries: T): T {
  return Object.freeze(entries.map((entry) => Object.freeze(entry))) as unknown as T;
}

// Codes are the World Aquatics result abbreviations: stable and language-neutral.
export const strokes = catalog([
  { code: 'FR', nameKey: 'sport.stroke.FR' },
  { code: 'BK', nameKey: 'sport.stroke.BK' },
  { code: 'BR', nameKey: 'sport.stroke.BR' },
  { code: 'FL', nameKey: 'sport.stroke.FL' },
  { code: 'IM', nameKey: 'sport.stroke.IM' },
] as const);

export const distances = catalog([
  { code: '25m', meters: 25, nameKey: 'sport.distance.25m' },
  { code: '50m', meters: 50, nameKey: 'sport.distance.50m' },
  { code: '100m', meters: 100, nameKey: 'sport.distance.100m' },
  { code: '200m', meters: 200, nameKey: 'sport.distance.200m' },
  { code: '400m', meters: 400, nameKey: 'sport.distance.400m' },
  { code: '800m', meters: 800, nameKey: 'sport.distance.800m' },
  { code: '1500m', meters: 1500, nameKey: 'sport.distance.1500m' },
] as const);

// Short course meters (25 m) and long course meters (50 m).
export const pools = catalog([
  { code: 'SCM', lengthMeters: 25, nameKey: 'sport.pool.SCM' },
  { code: 'LCM', lengthMeters: 50, nameKey: 'sport.pool.LCM' },
] as const);

// Training equipment a block may ask for (design section 6.3).
export const equipment = catalog([
  { code: 'fins', nameKey: 'sport.equipment.fins' },
  { code: 'paddles', nameKey: 'sport.equipment.paddles' },
  { code: 'snorkel', nameKey: 'sport.equipment.snorkel' },
  { code: 'kickboard', nameKey: 'sport.equipment.kickboard' },
  { code: 'pull_buoy', nameKey: 'sport.equipment.pull_buoy' },
] as const);

// Phases of a training session, in session order (design section 6.3).
export const phases = catalog([
  { code: 'warm_up', nameKey: 'sport.phase.warm_up' },
  { code: 'main', nameKey: 'sport.phase.main' },
  { code: 'technique', nameKey: 'sport.phase.technique' },
  { code: 'cool_down', nameKey: 'sport.phase.cool_down' },
] as const);

export type Stroke = (typeof strokes)[number];
export type Distance = (typeof distances)[number];
export type Pool = (typeof pools)[number];
export type StrokeCode = Stroke['code'];
export type DistanceCode = Distance['code'];
export type PoolCode = Pool['code'];
export type Equipment = (typeof equipment)[number];
export type Phase = (typeof phases)[number];
export type EquipmentCode = Equipment['code'];
export type PhaseCode = Phase['code'];

function hasCode(entries: readonly { code: string }[], value: unknown): boolean {
  return entries.some((entry) => entry.code === value);
}

export const isStroke = (value: unknown): value is StrokeCode => hasCode(strokes, value);
export const isDistance = (value: unknown): value is DistanceCode => hasCode(distances, value);
export const isPool = (value: unknown): value is PoolCode => hasCode(pools, value);
export const isEquipment = (value: unknown): value is EquipmentCode => hasCode(equipment, value);
export const isPhase = (value: unknown): value is PhaseCode => hasCode(phases, value);
