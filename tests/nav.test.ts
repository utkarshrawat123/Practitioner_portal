import { describe, it, expect } from 'vitest';
import { buildPractitionerNav, ALL_PRACTITIONER_ROUTES } from '@/lib/nav';

const qualified = { qualificationStatus: 'qualified' as const };
const student = { qualificationStatus: 'student' as const };

function hrefs(sections: ReturnType<typeof buildPractitionerNav>): string[] {
  return sections.flatMap((s) => s.items.map((i) => i.href));
}

describe('buildPractitionerNav', () => {
  it('returns nothing for a signed-out visitor', () => {
    expect(buildPractitionerNav(null)).toEqual([]);
  });

  it('groups routes under the deck section titles', () => {
    const titles = buildPractitionerNav(qualified).map((s) => s.title);
    expect(titles).toContain('Learn');
    expect(titles).toContain('My Clinic');
    expect(titles).toContain('Connect');
    expect(titles).toContain('Practice Growth');
  });

  it('puts Dashboard first, in an untitled section', () => {
    const first = buildPractitionerNav(qualified)[0];
    expect(first.title).toBeNull();
    expect(first.items[0].href).toBe('/dashboard');
  });

  it('groups Carts, Referrals and Leaderboard under Practice Growth', () => {
    const growth = buildPractitionerNav(qualified).find((s) => s.title === 'Practice Growth')!;
    expect(growth.items.map((i) => i.href)).toEqual(['/carts', '/referrals', '/leaderboard']);
  });

  it('groups the in-clinic tools under My Clinic', () => {
    const clinic = buildPractitionerNav(qualified).find((s) => s.title === 'My Clinic')!;
    expect(clinic.items.map((i) => i.href)).toEqual(['/my-clinic', '/toolkit', '/resources', '/assistant']);
  });

  it('surfaces every practitioner route — nothing is reachable only from the dashboard', () => {
    const shown = hrefs(buildPractitionerNav(qualified));
    for (const route of ALL_PRACTITIONER_ROUTES) {
      expect(shown, `route missing from the sidebar: ${route}`).toContain(route);
    }
  });

  it('shows the same route set to a student when nothing is audience-gated', () => {
    expect(hrefs(buildPractitionerNav(student)).sort()).toEqual(
      hrefs(buildPractitionerNav(qualified)).sort()
    );
  });

  it('drops a section entirely when audience gating empties it', () => {
    const sections = buildPractitionerNav(student, [
      { title: 'Qualified Only', items: [{ label: 'Secret', href: '/secret', audience: 'qualified' }] },
    ]);
    expect(sections.find((s) => s.title === 'Qualified Only')).toBeUndefined();
  });

  it('keeps an audience-gated item for the audience it targets', () => {
    const sections = buildPractitionerNav(qualified, [
      { title: 'Qualified Only', items: [{ label: 'Secret', href: '/secret', audience: 'qualified' }] },
    ]);
    expect(sections.find((s) => s.title === 'Qualified Only')!.items[0].href).toBe('/secret');
  });
});
