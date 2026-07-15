import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import DashboardApp from '@/components/DashboardApp';

export const metadata = { title: 'My Dashboard | Wild Nutrition Practitioner Community' };

export default async function DashboardPage() {
  const p = await getServerSessionPractitioner();
  if (p && p.status === 'approved' && !p.hasSeenWelcome) {
    redirect('/onboarding/welcome');
  }
  return <DashboardApp />;
}
