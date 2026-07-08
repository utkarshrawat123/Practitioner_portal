import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Practitioner Community | Wild Nutrition',
  description:
    'Join the Wild Nutrition expert practitioner community — apply for your practitioner account.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-stone bg-cream">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
            <a href="/apply" className="font-heading text-2xl tracking-wide text-ink">
              Wild Nutrition<sup className="text-xs align-super">®</sup>
            </a>
            <span className="text-xs uppercase tracking-[0.2em] text-ink2">
              Practitioner Community
            </span>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-stone bg-forest text-cream">
          <div className="mx-auto max-w-5xl px-6 py-10 text-sm">
            <p className="font-heading text-lg">Wild Nutrition® Ltd</p>
            <p className="mt-2 opacity-80">
              Questions? Contact our practitioner team at care@wildnutrition.com
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
