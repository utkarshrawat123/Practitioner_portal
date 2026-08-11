// Lightweight, dependency-free keyword frequency over practitioner messages.
// Non-AI, always available — powers the "most asked" terms in Chat Insights.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'to', 'of', 'in', 'on', 'for', 'with', 'as', 'at', 'by', 'from', 'up', 'about', 'into',
  'over', 'after', 'i', 'you', 'we', 'they', 'it', 'he', 'she', 'my', 'your', 'our', 'their', 'me',
  'us', 'them', 'this', 'that', 'these', 'those', 'do', 'does', 'did', 'have', 'has', 'had', 'can',
  'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must', 'not', 'no', 'yes', 'so',
  'what', 'when', 'where', 'which', 'who', 'how', 'why', 'any', 'some', 'there', 'here', 'just',
  'get', 'got', 'im', 'ive', 'dont', 'am', 'please', 'thanks', 'thank', 'hi', 'hello', 'hey',
]);

export function topKeywords(
  messages: string[],
  limit = 20
): { term: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const msg of messages) {
    const seen = new Set<string>(); // count each word once per message
    for (const raw of msg.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length < 3 || STOPWORDS.has(raw)) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
}
