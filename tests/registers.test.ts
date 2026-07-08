import { describe, it, expect, vi, afterEach } from 'vitest';
import { scoreNameMatch } from '@/lib/registers/http';
import { getRegister, registers } from '@/lib/registers';

afterEach(() => vi.unstubAllGlobals());

describe('scoreNameMatch', () => {
  it('high when full name appears (case/whitespace-insensitive, tags stripped)', () => {
    const html = '<div class="card"><b>Jane</b>   <i>Smith</i>, DipION</div>';
    expect(scoreNameMatch(html, ' jane SMITH ')).toBe('high');
  });

  it('partial when only surname appears', () => {
    expect(scoreNameMatch('<p>Dr A. Smith — London</p>', 'Jane Smith')).toBe('partial');
  });

  it('none when nothing matches; short surnames never partial-match', () => {
    expect(scoreNameMatch('<p>No practitioners found</p>', 'Jane Smith')).toBe('none');
    expect(scoreNameMatch('<p>welcome to our directory</p>', 'Li Wu')).toBe('none');
  });
});

describe('register registry', () => {
  it('exposes exactly BANT, CNHC, NNA, ANP', () => {
    expect(registers.map((r) => r.id).sort()).toEqual(['ANP', 'BANT', 'CNHC', 'NNA']);
    expect(getRegister('BANT')?.label).toContain('BANT');
    expect(getRegister('XYZ')).toBeNull();
  });

  it('every adapter produces an absolute manual search URL', () => {
    for (const r of registers) {
      expect(r.manualSearchUrl('Jane Smith')).toMatch(/^https:\/\//);
    }
  });
});

describe('adapter lookup', () => {
  it('returns high confidence when directory HTML contains the name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div>Jane Smith</div>', { status: 200 })));
    const result = await getRegister('BANT')!.lookup('Jane Smith', '12345');
    expect(result.confidence).toBe('high');
    expect(result.detail).toContain('BANT');
  });

  it('returns unavailable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const result = await getRegister('CNHC')!.lookup('Jane Smith', '12345');
    expect(result.confidence).toBe('unavailable');
  });

  it('returns unavailable on non-200 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('blocked', { status: 403 })));
    const result = await getRegister('NNA')!.lookup('Jane Smith', '12345');
    expect(result.confidence).toBe('unavailable');
  });
});
