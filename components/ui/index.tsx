import Link from 'next/link';

/**
 * Brand UI primitives, taken from the "Hub Ideas v2" design deck:
 * cream canvas, 16px-radius cards with no hard border, uppercase letterspaced
 * micro-labels, serif display headings, navy pill buttons and `action →` links.
 *
 * Everything here is presentational — no data access — so pages can adopt the
 * brand look without touching logic.
 */

/** Page wrapper: generous padding, comfortable measure. */
export function Page({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-6xl px-6 py-10 lg:px-10 lg:py-12 ${className}`}>{children}</div>;
}

/** Large serif page title, with an optional sub-line underneath. */
export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
          {title}
        </h1>
        {sub && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink2/75">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Uppercase letterspaced micro-label used above sections and on cards. */
export function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-medium uppercase tracking-label text-ink2/55 ${className}`}>{children}</p>
  );
}

/** Section heading — serif, smaller than the page title. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="font-heading text-[22px] leading-tight text-ink lg:text-[25px]">{children}</h2>
      {action}
    </div>
  );
}

type Tone = 'white' | 'blush' | 'navy';
const TONES: Record<Tone, string> = {
  white: 'bg-white',
  blush: 'bg-blush',
  navy: 'bg-navy-soft text-white',
};

/** Soft card: 16px radius, subtle shadow, no hard border. */
export function Card({
  children,
  tone = 'white',
  className = '',
  href,
}: {
  children?: React.ReactNode;
  tone?: Tone;
  className?: string;
  href?: string;
}) {
  const base = `rounded-card ${TONES[tone]} shadow-card ${className}`;
  if (href) {
    return (
      <Link href={href} className={`${base} block transition-shadow hover:shadow-lift`}>
        {children}
      </Link>
    );
  }
  return <div className={base}>{children}</div>;
}

/** Category pill, as used on the What's New cards. */
export function Pill({
  children,
  tone = 'terracotta',
}: {
  children: React.ReactNode;
  tone?: 'terracotta' | 'sage' | 'outline' | 'navy';
}) {
  const tones = {
    terracotta: 'bg-terracotta-mid text-white',
    sage: 'bg-sage text-ink',
    outline: 'border border-ink/20 text-ink2',
    navy: 'bg-navy text-white',
  } as const;
  return (
    <span
      className={`inline-block rounded-pill px-3 py-1 text-[10px] font-semibold uppercase tracking-label ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Primary navy pill button (or white-on-navy when `invert`). */
export function Button({
  children,
  href,
  onClick,
  invert = false,
  disabled = false,
  className = '',
  type = 'button',
  newTab = false,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  invert?: boolean;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  /** Opens in a new tab with a safe `rel` — for PDFs and off-site resources. */
  newTab?: boolean;
}) {
  const cls = `inline-flex items-center justify-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-medium transition-colors disabled:opacity-50 ${
    invert ? 'bg-white text-ink hover:bg-white/90' : 'bg-navy text-white hover:bg-navy-mid'
  } ${className}`;
  if (href) {
    return newTab ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>
    ) : (
      <Link href={href} className={cls}>{children}</Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/** Outlined pill button ("Refine search" in the deck). */
export function GhostButton({
  children,
  href,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cls = `inline-flex items-center justify-center gap-2 rounded-pill border border-ink/15 bg-white px-5 py-2.5 text-[14px] text-ink transition-colors hover:border-ink/30 ${className}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{children}</button>;
}

/** The deck's card footer link: label + arrow, above a hairline rule. */
export function ActionLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="group mt-4 inline-flex items-center gap-1.5 border-t border-ink/10 pt-3 text-[14px] text-ink transition-colors hover:text-terracotta"
    >
      {children}
      <span className="transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

/** Sage progress bar, as on the pathway cards. */
export function Progress({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-pill bg-ink/10 ${className}`}>
      <div className="h-full rounded-pill bg-olive transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Empty state that still feels designed rather than broken. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <p className="text-[15px] text-ink2/60">{children}</p>
    </Card>
  );
}

/** Quiet loading line — same measure as Empty so layouts do not jump. */
export function Loading({ children = 'Loading…' }: { children?: React.ReactNode }) {
  return <p className="py-10 text-center text-[15px] text-ink2/50">{children}</p>;
}

/**
 * Row of filter chips. Replaces the hard-bordered filter rows: the selected chip
 * is a filled terracotta pill, the rest are quiet outlines on the cream canvas.
 */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={on}
            className={`rounded-pill px-4 py-1.5 text-[13px] transition-colors ${
              on
                ? 'bg-terracotta-mid text-white'
                : 'bg-white/70 text-ink2 hover:bg-white hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shared form-field styling. Exported as class strings rather than components so
 * existing inputs keep their own props, handlers and validation untouched — the
 * restyle stays presentational.
 */
export const inputClass =
  'mt-1 w-full rounded-xl border-0 bg-white px-4 py-2.5 text-[15px] text-ink shadow-card outline-none ring-1 ring-ink/5 transition-shadow placeholder:text-ink2/40 focus:ring-2 focus:ring-terracotta-mid/50';

export const fieldLabelClass = 'text-[11px] font-medium uppercase tracking-label text-ink2/55';

/** Soft inline notice — replaces the old left-border banners. */
export function Note({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warn';
}) {
  const tones = {
    info: 'bg-blush text-ink2',
    warn: 'bg-terracotta-light/40 text-ink',
  } as const;
  return <div className={`rounded-card px-5 py-4 text-[14px] ${tones[tone]}`}>{children}</div>;
}
