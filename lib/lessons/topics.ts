export const TOPICS: { slug: string; label: string }[] = [
  { slug: 'hormones', label: 'Hormones' },
  { slug: 'gut-health', label: 'Gut Health' },
  { slug: 'iron-deficiency', label: 'Iron Deficiency' },
  { slug: 'fertility', label: 'Fertility' },
  { slug: 'pregnancy', label: 'Pregnancy' },
  { slug: 'menopause', label: 'Menopause' },
  { slug: 'sleep', label: 'Sleep' },
  { slug: 'stress', label: 'Stress' },
  { slug: 'immunity', label: 'Immunity' },
  { slug: 'formulation-science', label: 'Formulation Science' },
  { slug: 'micronutrients', label: 'Micronutrients' },
  { slug: 'general', label: 'General' },
];

const BY_SLUG = new Set(TOPICS.map((t) => t.slug));

export function isKnownTopic(slug: string): boolean {
  return BY_SLUG.has(slug);
}

/** Map a raw topic string to a known slug, else 'general'. */
export function normaliseTopic(raw: string): string {
  const slug = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return BY_SLUG.has(slug) ? slug : 'general';
}
