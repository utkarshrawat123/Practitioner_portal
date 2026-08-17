import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import { WELCOME_COOKIE } from '@/lib/welcomeGate';
import DashboardApp from '@/components/DashboardApp';

export const metadata = { title: 'My Dashboard | Wild Nutrition Practitioner Community' };

export default async function DashboardPage() {
  const p = await getServerSessionPractitioner();
  // Every login shows the Welcome takeover: gate on the per-login session
  // cookie (set on dismiss, cleared by the login routes), not the permanent
  // has_seen_welcome flag — so existing practitioners see it too, each login.
  if (p && p.status === 'approved' && !(await cookies()).get(WELCOME_COOKIE)) {
    redirect('/onboarding/welcome');
  }
  return <DashboardApp />;
}
