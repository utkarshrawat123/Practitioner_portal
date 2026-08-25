import type { Metadata } from 'next';
import { supportEmail } from '@/lib/support';
import './globals.css';
import { display, sans } from './fonts';
import Chrome from '@/components/Chrome';
import ChatGate from '@/components/ChatGate';
import PresenceBeat from '@/components/PresenceBeat';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import { buildPractitionerNav } from '@/lib/nav';

export const metadata: Metadata = {
  title: 'Practitioner Community | Wild Nutrition',
  description:
    'Join the Wild Nutrition expert practitioner community — apply for your practitioner account.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const practitioner = await getServerSessionPractitioner();
  const signedIn = !!practitioner && practitioner.status === 'approved';
  // Grouping lives in lib/nav.ts so the "every route is reachable" rule is testable.
  const navSections = signedIn
    ? buildPractitionerNav({ qualificationStatus: practitioner!.qualificationStatus })
    : [];

  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <Chrome signedIn={signedIn} navSections={navSections} supportEmail={supportEmail()}>
          <main>{children}</main>
        </Chrome>
        <ChatGate signedIn={signedIn} />
        <PresenceBeat signedIn={signedIn} />
      </body>
    </html>
  );
}
