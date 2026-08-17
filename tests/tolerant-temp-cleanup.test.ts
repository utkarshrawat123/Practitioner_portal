import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The teardown shim in tests/setup/tolerantTempCleanup.ts swallows file-lock
// errors so Windows can't fail otherwise-passing tests. Because it swallows
// errors, its narrowness is the safety property: only lock codes, only under
// os.tmpdir(). These guard against someone widening it into a blanket ignore.
describe('tolerant temp cleanup shim', () => {
  it('still throws non-lock errors (ENOENT) inside tmpdir', () => {
    const missing = path.join(os.tmpdir(), 'wn-shim-does-not-exist-9f3a1c');
    expect(() => fs.rmSync(missing)).toThrow(/ENOENT/);
  });

  it('still throws for paths outside tmpdir', () => {
    const missing = path.join(process.cwd(), 'wn-shim-does-not-exist-9f3a1c');
    expect(() => fs.rmSync(missing)).toThrow(/ENOENT/);
  });

  it('still removes temp dirs that are not locked', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-shim-'));
    fs.writeFileSync(path.join(dir, 'f.txt'), 'x');
    fs.rmSync(dir, { recursive: true, force: true });
    expect(fs.existsSync(dir)).toBe(false);
  });
});
