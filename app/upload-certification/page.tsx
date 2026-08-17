import CertificationUpload from '@/components/CertificationUpload';

export const metadata = { title: 'Upload certification | Wild Nutrition Practitioner Community' };
export const dynamic = 'force-dynamic';

export default async function UploadCertificationPage(
  props: {
    searchParams: Promise<{ token?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return <CertificationUpload token={searchParams.token ?? ''} />;
}
