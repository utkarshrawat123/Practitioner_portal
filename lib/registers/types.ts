import type { Confidence } from '@/lib/decision';

export type RegisterId = 'BANT' | 'CNHC' | 'NNA' | 'ANP';

export interface LookupResult {
  confidence: Confidence;
  detail: string;
}

export interface RegisterAdapter {
  id: RegisterId;
  label: string;
  /** Single polite name-based lookup against the register's public directory. */
  lookup(name: string, registerNumber: string): Promise<LookupResult>;
  /** Directory URL a human reviewer can open to verify manually. */
  manualSearchUrl(name: string): string;
}
