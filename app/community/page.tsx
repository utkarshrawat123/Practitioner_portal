import CommunityApp from '@/components/CommunityApp';
import { fbGroupUrl } from '@/lib/support';

export const metadata = { title: 'Community | Wild Nutrition Practitioner Community' };
// Dynamic so the group URL is read from the runtime env rather than baked in at
// build time — a NEXT_PUBLIC_* value would freeze whatever was set during build.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <CommunityApp fbGroupUrl={fbGroupUrl()} />;
}
