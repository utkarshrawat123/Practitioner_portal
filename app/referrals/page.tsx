import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import ReferralsApp from '@/components/ReferralsApp';

export const dynamic = 'force-dynamic';

export default async function ReferralsPage() {
  const p = await getServerSessionPractitioner();
  if (!p || p.status !== 'approved') redirect('/dashboard');
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-heading text-4xl text-ink">Refer a Colleague</h1>
      <p className="mt-2 text-ink2">Grow the community — earn £50 when a colleague you invite makes their first sale.</p>
      <ReferralsApp />
    </main>
  );
}
