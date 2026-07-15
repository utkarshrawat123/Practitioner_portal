import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import WelcomeExperience from '@/components/WelcomeExperience';
import { fraunces, inter } from './fonts';

export const metadata = { title: 'Welcome | Wild Nutrition Practitioner Community' };

export default async function WelcomePage() {
  const p = await getServerSessionPractitioner();
  if (!p || p.status !== 'approved') redirect('/dashboard');
  if (p.hasSeenWelcome) redirect('/dashboard');
  return (
    <div className={`${fraunces.variable} ${inter.variable}`}>
      <WelcomeExperience firstName={p.name.split(' ')[0] || null} />
    </div>
  );
}
