import AdminDashboard from '@/components/AdminDashboard';
import AdminLogoLink from '@/components/AdminLogoLink';

export const metadata = { title: 'Admin | WN Practitioner Community' };

export default function AdminPage() {
  return (
    <>
      <header className="border-b border-stone bg-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <AdminLogoLink className="shrink-0 font-heading text-2xl tracking-wide text-ink">
            Wild Nutrition<sup className="align-super text-xs">®</sup>
            <span className="ml-3 align-middle text-xs uppercase tracking-[0.2em] text-ink2/60">Admin</span>
          </AdminLogoLink>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="font-heading text-3xl text-ink">Practitioner applications</h1>
        <AdminDashboard />
      </div>
    </>
  );
}
