import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deletePtyIfCurrent } from './pty-map.js';

describe('deletePtyIfCurrent', () => {
  it('deletes only when Map holds the same session instance', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const ptys = new Map([[0, a]]);

    assert.equal(deletePtyIfCurrent(ptys, 0, b), false);
    assert.equal(ptys.get(0), a);

    assert.equal(deletePtyIfCurrent(ptys, 0, a), true);
    assert.equal(ptys.has(0), false);
  });

  it('no-ops when slot missing', () => {
    const ptys = new Map();
    assert.equal(deletePtyIfCurrent(ptys, 1, { id: 'x' }), false);
  });
});
