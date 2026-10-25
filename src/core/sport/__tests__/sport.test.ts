'use strict';

import { i18n } from '../../i18n';
import {
  distances,
  equipment,
  isDistance,
  isEquipment,
  isPhase,
  isPool,
  isStroke,
  phases,
  pools,
  strokes,
} from '..';

const catalogs = { strokes, distances, pools, equipment, phases };

describe.each(Object.entries(catalogs))('%s catalog', (_name, catalog) => {
  it('has unique codes', () => {
    const codes = catalog.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has an es-CO translation for every name key', () => {
    for (const entry of catalog) {
      expect(i18n.exists(entry.nameKey)).toBe(true);
    }
  });
});

describe('catalog contents', () => {
  it('lists the five strokes', () => {
    expect(strokes.map((s) => s.code)).toEqual(['FR', 'BK', 'BR', 'FL', 'IM']);
  });

  it('lists distances in meters, shortest first', () => {
    expect(distances.map((d) => [d.code, d.meters])).toEqual([
      ['25m', 25],
      ['50m', 50],
      ['100m', 100],
      ['200m', 200],
      ['400m', 400],
      ['800m', 800],
      ['1500m', 1500],
    ]);
  });

  it('lists 25 m and 50 m pools', () => {
    expect(pools.map((p) => [p.code, p.lengthMeters])).toEqual([
      ['SCM', 25],
      ['LCM', 50],
    ]);
  });

  it('lists the five pieces of training equipment', () => {
    expect(equipment.map((e) => e.code)).toEqual(['fins', 'paddles', 'snorkel', 'kickboard', 'pull_buoy']);
  });

  it('lists the four training phases in session order', () => {
    expect(phases.map((p) => p.code)).toEqual(['warm_up', 'main', 'technique', 'cool_down']);
  });

  it('is read-only', () => {
    expect(() => {
      // @ts-expect-error catalogs are read-only
      strokes[0].code = 'XX';
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error catalogs are read-only
      pools.push(pools[0]);
    }).toThrow(TypeError);
    expect(strokes[0].code).toBe('FR');
  });
});

describe.each([
  ['isStroke', isStroke, strokes],
  ['isDistance', isDistance, distances],
  ['isPool', isPool, pools],
  ['isEquipment', isEquipment, equipment],
  ['isPhase', isPhase, phases],
] as const)('%s', (_name, isCode, catalog) => {
  it('accepts every catalog code', () => {
    for (const entry of catalog) {
      expect(isCode(entry.code)).toBe(true);
    }
  });

  it.each(['', 'XX', 'fr', ' FR', 'scm', '50', 50, null, undefined, {}])('rejects %p', (value) => {
    expect(isCode(value)).toBe(false);
  });
});

describe('validators', () => {
  it('reject codes from another catalog', () => {
    expect(isStroke('SCM')).toBe(false);
    expect(isPool('FR')).toBe(false);
    expect(isDistance('FR')).toBe(false);
    expect(isEquipment('main')).toBe(false);
    expect(isPhase('fins')).toBe(false);
  });
});
