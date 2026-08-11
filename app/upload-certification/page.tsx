import CertificationUpload from '@/components/CertificationUpload';

export const metadata = { title: 'Upload certification | Wild Nutrition Practitioner Community' };
export const dynamic = 'force-dynamic';

export default function UploadCertificationPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  return <CertificationUpload token={searchParams.token ?? ''} />;
}
