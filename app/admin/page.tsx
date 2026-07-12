import AdminDashboard from '@/components/AdminDashboard';

export const metadata = { title: 'Admin | WN Practitioner Community' };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="font-heading text-3xl text-ink">Practitioner applications</h1>
      <AdminDashboard />
    </div>
  );
}
