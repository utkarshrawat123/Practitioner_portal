// Windows-only test-teardown tolerance.
//
// Most test files create a temp dir, point DB_PATH at a SQLite file inside it,
// and remove the dir in afterEach:
//
//   afterEach(async () => {
//     (await import('@/lib/db')).resetDbForTests();
//     fs.rmSync(dir, { recursive: true, force: true });
//   });
//
// resetDbForTests() calls client.close(), but on Windows the underlying file
// handle is not always released by the time rmSync runs, so the unlink fails
// with EBUSY and Vitest reports the test as failed even though every assertion
// in its body passed. (Before this shim: 169 "failures", all EBUSY, 0 assertion
// errors.) POSIX allows unlinking an open file, so this never triggers on
// macOS/Linux and leaves their behaviour untouched.
//
// We retry briefly, then give up quietly and let the OS reclaim the temp dir.
// Scoped to paths inside os.tmpdir() so a genuine rmSync failure anywhere else
// still surfaces as an error.
import fs from 'fs';
import os from 'os';
import path from 'path';

const LOCK_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES']);
const MAX_ATTEMPTS = 10;
const BACKOFF_MS = 20;

const tmpRoot = path.resolve(os.tmpdir());

function isInsideTmp(target: fs.PathLike): boolean {
  if (typeof target !== 'string') return false;
  const resolved = path.resolve(target);
  const a = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const b = process.platform === 'win32' ? tmpRoot.toLowerCase() : tmpRoot;
  return a.startsWith(b + path.sep);
}

/** Block the thread briefly — teardown is synchronous, so we cannot await. */
function sleepSync(ms: number): void {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(shared, 0, 0, ms);
}

const realRmSync = fs.rmSync.bind(fs);

fs.rmSync = ((target: fs.PathLike, options?: fs.RmOptions) => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return realRmSync(target, options);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (!code || !LOCK_CODES.has(code) || !isInsideTmp(target)) throw err;
      lastErr = err;
      sleepSync(BACKOFF_MS);
    }
  }
  // Still locked after ~200ms. The temp dir is disposable; losing it must not
  // fail an otherwise-passing test.
  void lastErr;
}) as typeof fs.rmSync;
