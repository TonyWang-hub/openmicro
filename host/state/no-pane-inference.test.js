import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('no pane inference', () => {
  it('host source does not call capture-pane for lighting', () => {
    const root = path.resolve('host');
    const files = fs.readdirSync(root, { recursive: true })
      .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
    for (const f of files) {
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      assert.equal(
        /capture-pane/.test(text),
        false,
        `${f} must not use capture-pane`,
      );
    }
  });
});
