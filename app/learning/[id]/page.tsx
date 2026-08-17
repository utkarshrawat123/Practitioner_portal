import PathwayDetail from '@/components/PathwayDetail';
export const metadata = { title: 'Pathway | Wild Nutrition Practitioner Community' };
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <PathwayDetail pathwayId={params.id} />;
}
