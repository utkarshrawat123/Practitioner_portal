import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { isAuthed } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

// Returns a signed token so the browser can upload directly to Vercel Blob,
// bypassing the ~4.5 MB serverless request-body limit.
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'image/*', 'application/pdf', 'video/*',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.ms-powerpoint',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        maximumSizeInBytes: 500 * 1024 * 1024,
      }),
      onUploadCompleted: async () => { /* metadata is saved by a separate call */ },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
