import { plansFixture } from './plans';
import { cellKey, type FulfillmentCell, type FulfillmentContent } from '../components/fulfillment';

const { blocks, vocabulary } = plansFixture;
const [b1, b2, b3, b4, b5] = blocks.map((block) => block.id);

const athletes = [
  { id: 'a1', shortName: 'Lucía R.' },
  { id: 'a2', shortName: 'Mateo C.' },
  { id: 'a3', shortName: 'Sara P.' },
  { id: 'a4', shortName: 'Tomás V.' },
];

const marked = { kind: 'marked', author: 'Paula G.', dateLabel: '24 oct' } as const;
const corrected = { kind: 'corrected', author: 'Paula G.', dateLabel: '24 oct' } as const;

// All four statuses, a partial with its count, timed cells (8/8, 3/8 and 1/1), both author captions and some missing cells.
const cells: Record<string, FulfillmentCell> = {
  [cellKey('a1', b1)]: { status: 'done', change: marked },
  [cellKey('a1', b2)]: { status: 'partial', completedRepetitions: 3, timesRecorded: 3, change: corrected },
  [cellKey('a1', b3)]: { status: 'absent' },
  [cellKey('a1', b4)]: { status: 'not_marked' },
  [cellKey('a1', b5)]: { status: 'done', timesRecorded: 1, change: marked },
  [cellKey('a2', b1)]: { status: 'done' },
  [cellKey('a2', b2)]: { status: 'done', timesRecorded: 8, change: marked },
  [cellKey('a2', b3)]: { status: 'partial', completedRepetitions: 2 },
  [cellKey('a2', b4)]: { status: 'done' },
  [cellKey('a3', b1)]: { status: 'absent' },
  [cellKey('a3', b3)]: { status: 'done' },
  [cellKey('a3', b4)]: { status: 'partial', completedRepetitions: 4, change: corrected },
  [cellKey('a3', b5)]: { status: 'not_marked' },
  [cellKey('a4', b1)]: { status: 'done' },
};

const grid: FulfillmentContent = { athletes, blocks, vocabulary, cells };

// Ten blocks, to scroll sideways: the five above twice, the second copy with its own ids and statuses shifted.
const manyBlocks = [...blocks, ...blocks.map((block) => ({ ...block, id: `${block.id}-2` }))];
const manyCells: Record<string, FulfillmentCell> = { ...cells };
for (const athlete of athletes) {
  for (const block of blocks) {
    const first = cells[cellKey(athlete.id, block.id)];
    if (first) manyCells[cellKey(athlete.id, `${block.id}-2`)] = { ...first, change: undefined };
  }
}

export const fulfillmentFixture = {
  grid,
  manyBlocks: { athletes, blocks: manyBlocks, vocabulary, cells: manyCells } satisfies FulfillmentContent,
  noAthletes: { ...grid, athletes: [] } satisfies FulfillmentContent,
  noBlocks: { ...grid, blocks: [] } satisfies FulfillmentContent,
  planName: 'Resistencia aeróbica',
  dateLabel: '24 oct',
  storedOnLabel: '24 oct',
};
