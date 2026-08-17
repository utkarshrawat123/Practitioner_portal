import PayPage from '@/components/PayPage';

export const metadata = { title: 'Complete your order | Wild Nutrition' };

export default async function PayRoute(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return <PayPage token={params.token} />;
}
