import { Fraunces, Inter } from 'next/font/google';

/**
 * Brand typography.
 *
 * The brand faces (Gestura display serif, Basis Grotesque) are commercially
 * licensed and cannot be shipped here, so these are the closest open matches to
 * the design deck:
 *  - Fraunces — high-contrast display serif; `SOFT`/`WONK` dialled down and
 *    optical sizing on, which lands close to the deck's headings.
 *  - Inter — neutral grotesque for body copy and UI.
 *
 * next/font downloads and SELF-HOSTS these at build time (emitted into the
 * static assets), so there is no runtime request to Google and it works on
 * Cloudflare Workers.
 *
 * To swap in the licensed faces later, replace these with next/font/local and
 * keep the same CSS variable names — nothing else needs to change.
 */
export const display = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--font-display',
});

export const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});
