import AdminDashboard from '@/components/AdminDashboard';

export const metadata = { title: 'Admin | WN Practitioner Community' };

export default function AdminPage() {
  return (
    <div className="w-full px-8 py-10 lg:px-12">
      <h1 className="font-heading text-3xl text-ink">Practitioner applications</h1>
      <AdminDashboard />
    </div>
  );
}
