import { politeFetch, scoreNameMatch } from './http';
import type { LookupResult, RegisterAdapter, RegisterId } from './types';

function makeAdapter(opts: {
  id: RegisterId;
  label: string;
  searchUrl: (name: string) => string;
  manualUrl: (name: string) => string;
}): RegisterAdapter {
  return {
    id: opts.id,
    label: opts.label,
    manualSearchUrl: opts.manualUrl,
    async lookup(name: string, _registerNumber: string): Promise<LookupResult> {
      const html = await politeFetch(opts.searchUrl(name));
      if (html === null) {
        return {
          confidence: 'unavailable',
          detail: `${opts.id} directory could not be reached — verify manually.`,
        };
      }
      const confidence = scoreNameMatch(html, name);
      return {
        confidence,
        detail: `Name search against the public ${opts.id} directory returned confidence "${confidence}". Register numbers are not publicly searchable on ${opts.id}.`,
      };
    },
  };
}

export const registers: RegisterAdapter[] = [
  makeAdapter({
    id: 'BANT',
    label: 'BANT — British Association for Nutrition and Lifestyle Medicine',
    searchUrl: (n) => `https://practitioner-search.bant.org.uk/?search=${encodeURIComponent(n)}`,
    manualUrl: (n) => `https://practitioner-search.bant.org.uk/?search=${encodeURIComponent(n)}`,
  }),
  makeAdapter({
    id: 'CNHC',
    label: 'CNHC — Complementary & Natural Healthcare Council',
    searchUrl: (n) => `https://search.cnhcregister.org.uk/?name=${encodeURIComponent(n)}`,
    manualUrl: () => 'https://search.cnhcregister.org.uk/',
  }),
  makeAdapter({
    id: 'NNA',
    label: 'NNA — Naturopathic Nutrition Association',
    searchUrl: () => 'https://www.nna-uk.com/find-a-therapist',
    manualUrl: () => 'https://www.nna-uk.com/find-a-therapist',
  }),
  makeAdapter({
    id: 'ANP',
    label: 'ANP — Association of Naturopathic Practitioners',
    searchUrl: () => 'https://theanp.co.uk/member-directory/',
    manualUrl: () => 'https://theanp.co.uk/member-directory/',
  }),
];

export function getRegister(id: string): RegisterAdapter | null {
  return registers.find((r) => r.id === id) ?? null;
}
