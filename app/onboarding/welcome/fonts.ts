import { Fraunces, Inter } from 'next/font/google';

export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
});
