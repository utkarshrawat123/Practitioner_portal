import PayPage from '@/components/PayPage';

export const metadata = { title: 'Complete your order | Wild Nutrition' };

export default function PayRoute({ params }: { params: { token: string } }) {
  return <PayPage token={params.token} />;
}
