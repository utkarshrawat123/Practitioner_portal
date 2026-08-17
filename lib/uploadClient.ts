/**
 * Client-side helper: uploads a file to the admin upload route, which stores it
 * server-side (R2 on Cloudflare, local disk in dev) and returns its public URL +
 * key. Drop-in replacement for the old Vercel Blob `upload()` — same return
 * shape `{ url, pathname }` — but portable and needing no client upload token.
 */
export async function uploadFile(
  pathname: string,
  file: File
): Promise<{ url: string; pathname: string }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('pathname', pathname);
  const res = await fetch('/api/admin/media/upload', { method: 'POST', body: fd });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? 'Upload failed');
  }
  return (await res.json()) as { url: string; pathname: string };
}
