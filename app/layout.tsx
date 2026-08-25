import type { Metadata } from 'next';
import './globals.css';
import { display, sans } from './fonts';
import Chrome from '@/components/Chrome';
import ChatGate from '@/components/ChatGate';
import PresenceBeat from '@/components/PresenceBeat';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import { hasAccess, type Audience } from '@/lib/access';

export const metadata: Metadata = {
  title: 'Practitioner Community | Wild Nutrition',
  description:
    'Join the Wild Nutrition expert practitioner community — apply for your practitioner account.',
};

interface NavItem { label: string; href: string; audience?: Audience }

/** Sidebar order follows the design deck: learning first, account-ish last. */
const PRACTITIONER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Learning', href: '/learning' },
  { label: 'Clinical Toolkit', href: '/toolkit' },
  { label: 'Resources', href: '/resources' },
  { label: 'Community', href: '/community' },
  { label: 'Events', href: '/events' },
  { label: 'Patient Carts', href: '/carts' },
  { label: 'Refer & Earn', href: '/referrals' },
  { label: 'My CPD', href: '/cpd' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const practitioner = await getServerSessionPractitioner();
  const signedIn = !!practitioner && practitioner.status === 'approved';
  const navItems = signedIn
    ? PRACTITIONER_NAV.filter((i) =>
        hasAccess({ qualificationStatus: practitioner!.qualificationStatus }, i)
      ).map((i) => ({ label: i.label, href: i.href }))
    : [];

  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <Chrome signedIn={signedIn} navItems={navItems}>
          <main>{children}</main>
        </Chrome>
        <ChatGate signedIn={signedIn} />
        <PresenceBeat signedIn={signedIn} />
      </body>
    </html>
  );
}
