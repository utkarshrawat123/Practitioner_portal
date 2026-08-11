'use client';

import { usePathname } from 'next/navigation';
import ChatWidget from '@/components/ChatWidget';

/**
 * Decides whether to show the practitioner chat bubble. Server layout passes
 * `signedIn` (approved practitioner session present); this client wrapper hides
 * the widget on the admin console and the full-takeover onboarding routes,
 * mirroring ChromeGate. Signed-out visitors never see it.
 */
export default function ChatGate({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  if (!signedIn) return null;
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/onboarding')) return null;
  return <ChatWidget />;
}
