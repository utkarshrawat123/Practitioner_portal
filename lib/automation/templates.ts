import type { Practitioner } from '@/lib/db';

const shell = (heading: string, body: string) => `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#191919">
    <p style="font-size:12px;letter-spacing:3px;color:#3a4f41">WILD NUTRITION</p>
    <h1 style="font-size:22px;color:#3a4f41">${heading}</h1>
    ${body}
    <p style="font-size:12px;color:#999;margin-top:24px">Wild Nutrition Practitioner Community</p>
  </div>`;

export function recognitionEmail(p: Practitioner, tier: string) {
  const t = tier.charAt(0).toUpperCase() + tier.slice(1);
  return {
    subject: `You've reached ${t} tier 🎉`,
    html: shell(`Congratulations, ${p.name.split(' ')[0]}`, `
      <p>Your contribution has moved you up to <strong>${t}</strong> tier in the Wild Nutrition practitioner community.</p>
      <p>Thank you for the trust you place in us and the outcomes you deliver for your clients.</p>`),
  };
}

export function reEngagementEmail(p: Practitioner) {
  return {
    subject: `We miss you at Wild Nutrition`,
    html: shell(`Hi ${p.name.split(' ')[0]}`, `
      <p>It's been a little while. Your practitioner hub has new learning pathways, clinical resources and live events waiting for you.</p>
      <p>Pop back in whenever suits — we're here to support your clinic.</p>`),
  };
}

export function quarterlyEmail(p: Practitioner, stats: { orders: number; lessons: number }) {
  return {
    subject: `Your quarterly Wild Nutrition impact`,
    html: shell(`Your quarter in review, ${p.name.split(' ')[0]}`, `
      <p>A quick summary of your recent activity:</p>
      <ul>
        <li><strong>${stats.orders}</strong> client orders in the last 12 months</li>
        <li><strong>${stats.lessons}</strong> lessons completed toward CPD</li>
      </ul>
      <p>Thank you for being part of the community.</p>`),
  };
}
