import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import { WELCOME_COOKIE } from '@/lib/welcomeGate';
import WelcomeExperience from '@/components/WelcomeExperience';
import { fraunces, inter } from './fonts';

export const metadata = { title: 'Welcome | Wild Nutrition Practitioner Community' };

export default async function WelcomePage() {
  const p = await getServerSessionPractitioner();
  if (!p || p.status !== 'approved') redirect('/dashboard');
  // Already dismissed this login session → straight to the dashboard.
  if (cookies().get(WELCOME_COOKIE)) redirect('/dashboard');
  return (
    <div className={`${fraunces.variable} ${inter.variable}`}>
      <WelcomeExperience firstName={p.name.split(' ')[0] || null} />
    </div>
  );
}
