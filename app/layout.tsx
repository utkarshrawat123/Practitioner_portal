import type { Metadata } from 'next';
import './globals.css';
import SiteHeader from '@/components/SiteHeader';
import ChromeGate from '@/components/ChromeGate';
import ChatGate from '@/components/ChatGate';
import PresenceBeat from '@/components/PresenceBeat';
import { getServerSessionPractitioner } from '@/lib/serverSession';

export const metadata: Metadata = {
  title: 'Practitioner Community | Wild Nutrition',
  description:
    'Join the Wild Nutrition expert practitioner community — apply for your practitioner account.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const practitioner = await getServerSessionPractitioner();
  const signedIn = !!practitioner && practitioner.status === 'approved';
  return (
    <html lang="en">
      <body>
        <ChromeGate><SiteHeader /></ChromeGate>
        <main>{children}</main>
        <ChatGate signedIn={signedIn} />
        <PresenceBeat signedIn={signedIn} />
        <ChromeGate>
          <footer className="mt-24 border-t border-stone bg-forest text-cream">
            <div className="mx-auto max-w-7xl px-6 py-10 text-sm">
              <p className="font-heading text-lg">Wild Nutrition® Ltd</p>
              <p className="mt-2 opacity-80">
                Questions? Contact us at utkarshrawatofficial@gmail.com
              </p>
            </div>
          </footer>
        </ChromeGate>
      </body>
    </html>
  );
}
