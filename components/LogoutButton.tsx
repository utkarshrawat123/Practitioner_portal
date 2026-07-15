'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/dashboard');
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="whitespace-nowrap text-ink2/70 underline transition-colors hover:text-terracotta"
    >
      Log out
    </button>
  );
}
