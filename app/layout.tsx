import type { Metadata } from 'next';
import './globals.css';
import SiteHeader from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Practitioner Community | Wild Nutrition',
  description:
    'Join the Wild Nutrition expert practitioner community — apply for your practitioner account.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
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
