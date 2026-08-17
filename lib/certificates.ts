import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { putObject } from '@/lib/storage';
import {
  type Pathway,
  type Certificate,
  getCertificate,
  issueCertificate,
  pathwayProgress,
} from '@/lib/db';

/** Renders a branded A5-landscape CPD certificate as PDF bytes (pure, serverless-safe). */
export async function generateCertificatePdf(opts: {
  name: string;
  pathwayTitle: string;
  cpdHours: number;
  date: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 420]);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const { width, height } = page.getSize();

  const ink = rgb(0.098, 0.098, 0.098);
  const forest = rgb(0.227, 0.309, 0.254);
  const terracotta = rgb(0.643, 0.322, 0.282);
  const cream = rgb(0.973, 0.965, 0.953);

  page.drawRectangle({ x: 0, y: 0, width, height, color: cream });
  page.drawRectangle({
    x: 22, y: 22, width: width - 44, height: height - 44,
    borderColor: forest, borderWidth: 1.5,
  });

  const center = (text: string, font: typeof serif, size: number, y: number, color = ink) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  center('WILD NUTRITION', sans, 12, height - 72, forest);
  center('Certificate of Completion', serifBold, 26, height - 122, ink);
  center('This certifies that', sans, 11, height - 168, ink);
  center(opts.name, serifBold, 22, height - 204, terracotta);
  center('has successfully completed the learning pathway', sans, 11, height - 240, ink);
  center(opts.pathwayTitle, serif, 18, height - 272, forest);
  center(`${opts.cpdHours} CPD hours   ·   ${opts.date}`, sans, 11, 62, ink);

  return doc.save();
}

/**
 * Issues a certificate iff the pathway is complete for the practitioner and none exists yet.
 * Idempotent: returns the existing certificate without regenerating.
 */
export async function maybeIssueCertificate(
  practitionerId: number,
  practitionerName: string,
  pathway: Pathway
): Promise<Certificate | null> {
  const existing = await getCertificate(practitionerId, pathway.id);
  if (existing) return existing;
  const prog = await pathwayProgress(practitionerId, pathway.id);
  if (!prog.complete) return null;

  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const pdf = await generateCertificatePdf({
    name: practitionerName,
    pathwayTitle: pathway.title,
    cpdHours: pathway.cpdHours,
    date,
  });
  const { url } = await putObject(
    `certificates/${pathway.id}-${practitionerId}-${Date.now()}.pdf`,
    Buffer.from(pdf),
    { access: 'public', contentType: 'application/pdf' }
  );
  return issueCertificate(practitionerId, pathway.id, url);
}
