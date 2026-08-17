import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { putObject } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Server-side upload: the browser POSTs the file here and we store it in R2 (or
// local disk in dev) via lib/storage. Replaces the old Vercel Blob client-upload
// handshake. Cloudflare Workers accept large request bodies (up to ~100 MB),
// which covers the media this portal handles.
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_PREFIXES = ['media/', 'thumbnails/', 'toolkit/'];
const ALLOWED_TYPES = [
  /^image\//,
  /^video\//,
  /^application\/pdf$/,
  /^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/,
  /^application\/vnd\.ms-powerpoint$/,
  /^application\/msword$/,
  /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
];

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const file = form.get('file');
  const pathname = String(form.get('pathname') ?? '');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }
  // Admin-only endpoint, but constrain pathnames to the known upload folders.
  if (!ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.json({ error: 'Invalid pathname' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 100 MB)' }, { status: 413 });
  }
  if (file.type && !ALLOWED_TYPES.some((rx) => rx.test(file.type))) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 415 });
  }

  const { url } = await putObject(pathname, file, { access: 'public', contentType: file.type });
  return NextResponse.json({ url, pathname });
}
