import { portalUrl } from '@/lib/codes';
import { supportEmail } from '@/lib/support';


/** The contact line, or an empty string when no support address is configured. */
function contactLine(): string {
  const email = supportEmail();
  return email ? `
  <p style="font-size:13px;color:#666">Questions? Reach us at ${email}</p>` : '';
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

/** Sent the moment a practitioner is approved — carries their code, link and a dashboard CTA. */
export function welcomeEmail(input: {
  name: string;
  email: string;
  code: string;
  link: string;
}): RenderedEmail {
  const firstName = input.name.trim().split(/\s+/)[0] || 'there';
  const loginUrl = `${portalUrl()}/dashboard`;
  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#191919;line-height:1.6">
  <h1 style="font-size:26px;color:#191919;margin:0 0 8px">Welcome to the community, ${firstName}</h1>
  <p>Your registration has been verified and your Wild Nutrition practitioner account is approved.</p>
  <div style="background:#f8f6f3;border:1px solid #e6e3df;padding:20px;margin:20px 0">
    <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#3a4f41;margin:0 0 4px">Your referral code</p>
    <p style="font-size:22px;color:#a45248;margin:0 0 16px;font-weight:bold">${input.code}</p>
    <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#3a4f41;margin:0 0 4px">Your referral link</p>
    <p style="font-size:14px;word-break:break-all;margin:0"><a href="${input.link}" style="color:#a45248">${input.link}</a></p>
  </div>
  <p>Your dashboard is where everything lives — referral clicks, orders, commission, your tier, the protocol assistant and the learning library. Sign in any time:</p>
  <p style="margin:20px 0">
    <a href="${loginUrl}" style="background:#191919;color:#f8f6f3;padding:14px 28px;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase">Go to your dashboard</a>
  </p>
  <p style="font-size:13px;color:#666">We use a secure one-time login link — just enter this email address (${input.email}) on the sign-in page and we'll send you a link.</p>${contactLine()}
</div>`.trim();
  return { subject: 'Welcome to the Wild Nutrition Practitioner Community', html };
}

/** Sent to a STUDENT applicant — asks them to upload proof of study to complete review. */
export function certificationRequestEmail(input: { name: string; uploadUrl: string }): RenderedEmail {
  const firstName = input.name.trim().split(/\s+/)[0] || 'there';
  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#191919;line-height:1.6">
  <h1 style="font-size:24px;margin:0 0 8px">Thanks for applying, ${firstName}</h1>
  <p>You applied to the Wild Nutrition Practitioner Community as a <strong>student</strong>. To complete
  your review, please upload your certification — proof of enrolment on a recognised nutrition course, a
  student ID, or a course confirmation letter (PDF or image).</p>
  <p style="margin:24px 0">
    <a href="${input.uploadUrl}" style="background:#191919;color:#f8f6f3;padding:14px 28px;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase">Upload your certification</a>
  </p>
  <p>Once uploaded, our practitioner team will review it and confirm your account. This secure link is
  unique to you and expires in 14 days.</p>
  <p style="font-size:13px;color:#666">If you didn't apply, you can safely ignore this email.</p>${contactLine()}
</div>`.trim();
  return { subject: 'Please upload your certification — Wild Nutrition', html };
}

/** The one-time magic-link login email. */
export function magicLinkEmail(input: { url: string }): RenderedEmail {
  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#191919;line-height:1.6">
  <h1 style="font-size:24px;margin:0 0 8px">Your login link</h1>
  <p>Click below to sign in to your Wild Nutrition practitioner dashboard. This link expires in 15 minutes and can be used once.</p>
  <p style="margin:24px 0">
    <a href="${input.url}" style="background:#191919;color:#f8f6f3;padding:14px 28px;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase">Sign in</a>
  </p>
  <p style="font-size:13px;color:#666">If you didn't request this, you can safely ignore this email.</p>
</div>`.trim();
  return { subject: 'Your Wild Nutrition login link', html };
}
