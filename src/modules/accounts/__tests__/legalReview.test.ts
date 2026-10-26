/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

import { LEGAL_REVIEW_PENDING } from '../legalReview';

const releasing = fs.readFileSync(path.join(__dirname, '../../../../docs/RELEASING.md'), 'utf8');
// \u0023 is a hash: the module rule bans anything that looks like a hex color, and an issue number does.
const line =
  '- [ ] `LEGAL_REVIEW_PENDING` in `src/modules/accounts/legalReview.ts` is `false` and issue \u0023106 (legal review of the authorization texts) is closed: never publish to production while it is `true`.';

describe('legal review flag', () => {
  it('is on the release checklist exactly while the review is pending', () => {
    // Flipping the flag forces touching the checklist.
    expect(releasing.includes(line)).toBe(LEGAL_REVIEW_PENDING);
  });
});
