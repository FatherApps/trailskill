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

export type Stroke = (typeof strokes)[number];
export type Distance = (typeof distances)[number];
export type Pool = (typeof pools)[number];
export type StrokeCode = Stroke['code'];
export type DistanceCode = Distance['code'];
export type PoolCode = Pool['code'];

function hasCode(entries: readonly { code: string }[], value: unknown): boolean {
  return entries.some((entry) => entry.code === value);
}

export const isStroke = (value: unknown): value is StrokeCode => hasCode(strokes, value);
export const isDistance = (value: unknown): value is DistanceCode => hasCode(distances, value);
export const isPool = (value: unknown): value is PoolCode => hasCode(pools, value);
