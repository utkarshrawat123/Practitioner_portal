import type { AssistantOutput } from '@/lib/ai/assistant';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface HandoutInput {
  practitionerName: string;
  code: string;
  link: string;
  output: AssistantOutput;
}

/**
 * Standalone, print-optimised, brand-styled HTML document. Every dynamic
 * string is escaped — model output and practitioner data are untrusted here.
 */
export function renderHandout({ practitionerName, code, link, output }: HandoutInput): string {
  const rows = output.protocol
    .map(
      (item) => `
      <tr>
        <td class="product">${esc(item.product)}</td>
        <td>${esc(item.dose)}</td>
        <td>${esc(item.rationale)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Your Supplement Plan — Wild Nutrition</title>
<style>
  :root { color-scheme: light; }
  body { font-family: Basis, system-ui, sans-serif; color: #222222; background: #f8f6f3;
         margin: 0; padding: 40px 32px; }
  .sheet { max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e6e3df;
           padding: 40px; }
  h1, h2 { font-family: Gestura, Georgia, serif; color: #191919; font-weight: 500; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 20px; margin: 28px 0 8px; }
  .brand { font-family: Gestura, Georgia, serif; font-size: 18px; color: #191919; margin-bottom: 24px; }
  .meta { font-size: 12px; text-transform: uppercase; letter-spacing: 0.15em; color: #3a4f41; }
  p { line-height: 1.6; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
       color: #3a4f41; border-bottom: 1px solid #d0d1ab; padding: 8px 8px 8px 0; }
  td { border-bottom: 1px solid #e6e3df; padding: 10px 8px 10px 0; vertical-align: top; line-height: 1.5; }
  td.product { font-family: Gestura, Georgia, serif; color: #a45248; }
  .code-box { background: #f8f6f3; border: 1px solid #d0d1ab; padding: 16px 20px; margin-top: 28px; }
  .code { font-family: Gestura, Georgia, serif; font-size: 22px; color: #a45248; letter-spacing: 0.05em; }
  .link { font-size: 13px; word-break: break-all; }
  .disclaimer { font-size: 11px; color: #757575; margin-top: 28px; line-height: 1.5;
                border-top: 1px solid #e6e3df; padding-top: 14px; }
  .print-btn { display: block; margin: 24px auto 0; background: #191919; color: #f8f6f3;
               border: 0; padding: 12px 28px; font-size: 12px; text-transform: uppercase;
               letter-spacing: 0.2em; cursor: pointer; }
  @media print { body { background: #ffffff; padding: 0; } .sheet { border: 0; padding: 24px; }
                 .print-btn { display: none; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="brand">Wild Nutrition&reg;</div>
    <p class="meta">Your supplement plan</p>
    <h1>Prepared for you by ${esc(practitionerName)}</h1>
    <p>${esc(output.handout.intro)}</p>

    <h2>Your supplements</h2>
    <table>
      <thead><tr><th>Product</th><th>How to take it</th><th>Why it's included</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <h2>How to get the most from your plan</h2>
    <p>${esc(output.handout.explanation)}</p>
    <p>${esc(output.handout.lifestyle_notes)}</p>

    <div class="code-box">
      <p class="meta">Your practitioner discount code</p>
      <p class="code">${esc(code)}</p>
      <p class="link">Order at: ${esc(link)}</p>
    </div>

    <p class="disclaimer">
      This plan was prepared for you by your practitioner, ${esc(practitionerName)}, and is
      general wellbeing information — it is not medical advice, and it does not replace
      guidance from your doctor. Always tell your practitioner and your GP about any
      medication you take, and speak to them before making changes. Food supplements should
      not be used as a substitute for a varied, balanced diet.
    </p>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;
}
