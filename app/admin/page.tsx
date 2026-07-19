import Link from 'next/link';
import AdminDashboard from '@/components/AdminDashboard';

export const metadata = { title: 'Admin | WN Practitioner Community' };

export default function AdminPage() {
  return (
    <>
      <header className="border-b border-stone bg-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/admin" className="shrink-0 font-heading text-2xl tracking-wide text-ink">
            Wild Nutrition<sup className="align-super text-xs">®</sup>
            <span className="ml-3 align-middle text-xs uppercase tracking-[0.2em] text-ink2/60">Admin</span>
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="font-heading text-3xl text-ink">Practitioner applications</h1>
        <AdminDashboard />
      </div>
    </>
  );
}
