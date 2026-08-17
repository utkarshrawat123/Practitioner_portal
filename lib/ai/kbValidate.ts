import type { KbDocument, KnowledgeBase } from './kb';

export interface KbIssue {
  docId: string;
  problem: string;
}

export type ReviewStatus = 'approved' | 'awaiting-approval';

/**
 * Every dossier declares its clinical-review state on a blockquote line:
 *
 *   > **Clinical review:** AWAITING APPROVAL — not for live practitioner use.
 *   > **Clinical review:** APPROVED 2026-09-01 — Wild Nutrition clinical team.
 *
 * A positive marker (rather than a "this is a placeholder" banner) means a
 * document cannot become silently unapproved by deleting a line — the validator
 * fails instead. See docs/KB_AUTHORING.md.
 */
const REVIEW_MARKER = /^>\s*\*\*Clinical review:\*\*\s*(APPROVED|AWAITING APPROVAL)\b/im;

/**
 * Sections the assistant's SYSTEM_RULES depend on: dosing is quoted verbatim
 * from "Label dosing", clinical claims must come from "Mechanism & evidence
 * notes", and safety_flags lean on "Cautions & interactions".
 */
const REQUIRED_PRODUCT_SECTIONS = [
  'Key ingredients',
  'Label dosing',
  'Mechanism & evidence notes',
  'Cautions & interactions',
];

export function reviewStatus(doc: KbDocument): ReviewStatus | null {
  const match = doc.content.match(REVIEW_MARKER);
  if (!match) return null;
  return match[1].toUpperCase() === 'APPROVED' ? 'approved' : 'awaiting-approval';
}

/** Body text under `## <heading>`, or null when the section is absent. */
function sectionBody(content: string, heading: string): string | null {
  const lines = content.split('\n');
  const wanted = heading.trim().toLowerCase();
  const start = lines.findIndex(
    (line) => /^##\s+/.test(line) && line.replace(/^##\s+/, '').trim().toLowerCase() === wanted
  );
  if (start === -1) return null;

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n').trim();
}

/**
 * Structural check on the knowledge base. Returns every problem found so a
 * contributor sees the whole list at once; an empty array means the KB meets the
 * contract the assistant prompt relies on.
 */
export function validateKnowledgeBase(kb: KnowledgeBase): KbIssue[] {
  const issues: KbIssue[] = [];

  for (const doc of kb.documents) {
    if (!/^#\s+\S/m.test(doc.content)) {
      issues.push({
        docId: doc.id,
        problem: 'missing an H1 title — the assistant cites documents by that exact title',
      });
    }

    if (!reviewStatus(doc)) {
      issues.push({
        docId: doc.id,
        problem:
          'missing a "Clinical review:" marker — expected APPROVED or AWAITING APPROVAL',
      });
    }

    if (!doc.isProduct) continue;

    for (const section of REQUIRED_PRODUCT_SECTIONS) {
      const body = sectionBody(doc.content, section);
      if (body === null) {
        issues.push({ docId: doc.id, problem: `missing required section "## ${section}"` });
      } else if (!body) {
        issues.push({ docId: doc.id, problem: `required section "## ${section}" is empty` });
      }
    }
  }

  return issues;
}

/**
 * Documents not yet signed off by the clinical team. Anything without a marker
 * counts as unapproved. This list MUST be empty before the assistant is used
 * with real practitioners.
 */
export function docsAwaitingClinicalApproval(kb: KnowledgeBase): KbDocument[] {
  return kb.documents.filter((doc) => reviewStatus(doc) !== 'approved');
}
