'use client';

/**
 * The admin header logo. Clicking it returns the dashboard to the card home
 * (the section grid). We can't rely on a plain <Link href="/admin"> because
 * we're already on /admin — Next.js doesn't remount, so the open section would
 * persist. Instead we dispatch an `admin:home` event that AdminDashboard listens
 * for and resets its view. Keeps a real href so cmd/ctrl-click still opens a tab.
 */
export default function AdminLogoLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href="/admin"
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        window.dispatchEvent(new Event('admin:home'));
      }}
    >
      {children}
    </a>
  );
}
