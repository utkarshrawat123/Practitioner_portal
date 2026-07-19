import { redirect } from 'next/navigation';
import { getServerSessionPractitioner } from '@/lib/serverSession';
import CartsApp from '@/components/CartsApp';

export const metadata = { title: 'Patient Carts | Wild Nutrition' };

export default async function CartsPage() {
  const practitioner = await getServerSessionPractitioner();
  if (!practitioner || practitioner.status !== 'approved') redirect('/dashboard');
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-heading text-3xl text-ink">Patient Carts</h1>
      <p className="mt-2 text-sm text-ink2/70">Build a cart for a patient and share a secure link to pay.</p>
      <CartsApp practitionerName={practitioner.name} />
    </div>
  );
}
