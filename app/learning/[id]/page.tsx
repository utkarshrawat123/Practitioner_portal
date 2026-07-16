import PathwayDetail from '@/components/PathwayDetail';
export const metadata = { title: 'Pathway | Wild Nutrition Practitioner Community' };
export default function Page({ params }: { params: { id: string } }) {
  return <PathwayDetail pathwayId={params.id} />;
}
