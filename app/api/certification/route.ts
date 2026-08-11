import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { verifyCertUploadToken } from '@/lib/certUpload';
import { addEvent, getPractitioner, setCertification } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a cert is a PDF or a photo
const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
]);

function tokenFrom(req: Request): string {
  return new URL(req.url).searchParams.get('token') ?? '';
}

/** Validate the upload link and return who it belongs to (for the page greeting). */
export async function GET(req: Request): Promise<NextResponse> {
  const id = verifyCertUploadToken(tokenFrom(req));
  if (!id) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 401 });
  const p = await getPractitioner(id);
  if (!p) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  return NextResponse.json({
    name: p.name,
    status: p.status,
    alreadyUploaded: !!p.certificationUrl,
  });
}

/** Receive the certification file, store it in Blob, attach it to the practitioner. */
export async function POST(req: Request): Promise<NextResponse> {
  const id = verifyCertUploadToken(tokenFrom(req));
  if (!id) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 401 });
  const p = await getPractitioner(id);
  if (!p) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Please choose a file to upload.' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Please upload a PDF or an image (JPG, PNG).' }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be between 1 byte and 10 MB.' }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'certification';
  const pathname = `certifications/${id}-${Date.now()}-${safeName}`;
  let url: string;
  try {
    const blob = await put(pathname, file, { access: 'public', contentType: file.type });
    url = blob.url;
  } catch (err) {
    console.error('certification upload failed', err);
    return NextResponse.json({ error: 'Upload failed — please try again.' }, { status: 502 });
  }

  await setCertification(id, { url, pathname, filename: file.name });
  await addEvent(id, 'certification', `Certification uploaded (${file.name}). Awaiting admin review.`);
  return NextResponse.json({ ok: true });
}
