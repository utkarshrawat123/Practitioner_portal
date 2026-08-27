import AdminDashboard from '@/components/AdminDashboard';
import AdminLogoLink from '@/components/AdminLogoLink';

export const metadata = { title: 'Admin | WN Practitioner Community' };

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-cream">
      {/*
        Navy bar rather than the old cream strip with a hard bottom border: it
        echoes the practitioner sidebar, so admin reads as the same product
        seen from the other side rather than a different tool.
      */}
      <header className="bg-navy">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5 lg:px-10">
          <AdminLogoLink className="shrink-0">
            <span className="block font-body text-[15px] font-semibold uppercase tracking-[0.18em] text-white">
              Wild Nutrition<sup className="align-super text-[8px]">®</sup>
            </span>
            <span className="mt-1 block font-body text-[9px] uppercase tracking-[0.3em] text-terracotta-light">
              Admin console
            </span>
          </AdminLogoLink>
        </div>
      </header>

      {/*
        The page title lives in AdminDashboard, not here: it has to change with
        the selected section. It used to be a static "Practitioner applications"
        that stayed put while you were in Media or Reporting.
      */}
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-12">
        <AdminDashboard />
      </div>
    </div>
  );
}
