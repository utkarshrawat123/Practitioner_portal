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
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
            <a href="/apply" className="font-heading text-2xl tracking-wide text-ink">
              Wild Nutrition<sup className="text-xs align-super">®</sup>
            </a>
            <nav className="flex items-center gap-6 text-xs uppercase tracking-[0.2em]">
              <a href="/apply" className="text-ink2 transition-colors hover:text-terracotta">
                Apply
              </a>
              <a href="/dashboard" className="text-ink2 transition-colors hover:text-terracotta">
                Sign in
              </a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-stone bg-forest text-cream">
          <div className="mx-auto max-w-7xl px-6 py-10 text-sm">
            <p className="font-heading text-lg">Wild Nutrition® Ltd</p>
            <p className="mt-2 opacity-80">
              Questions? Contact us at utkarshrawatofficial@gmail.com
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
