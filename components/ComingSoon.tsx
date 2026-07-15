export default function ComingSoon({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center">
      <p className="text-xs uppercase tracking-[0.25em] text-terracotta">Coming soon</p>
      <h1 className="mt-3 font-heading text-4xl text-ink">{title}</h1>
      <p className="mt-4 text-ink2/80">
        {blurb ?? 'This part of the Practitioner Hub is on its way. Check back soon.'}
      </p>
      <a href="/dashboard" className="mt-8 inline-block bg-ink px-6 py-3 text-xs uppercase tracking-[0.2em] text-cream hover:bg-terracotta">
        Back to Home
      </a>
    </div>
  );
}
