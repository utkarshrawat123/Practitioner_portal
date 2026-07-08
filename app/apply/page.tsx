import ApplyForm from '@/components/ApplyForm';

export default function ApplyPage() {
  return (
    <div>
      <section className="bg-sage/40">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-forest">For Practitioners</p>
          <h1 className="mx-auto mt-4 max-w-2xl font-heading text-4xl leading-tight text-ink md:text-5xl">
            Join our expert practitioner community
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-ink2/90">
            Connect with a like-minded network of nutritional therapists and functional medicine
            practitioners dedicated to advancing clinical knowledge.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-14 md:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-heading text-3xl text-ink">Why join the community?</h2>
          <ul className="mt-6 space-y-4 text-ink2/90">
            <li><span className="font-heading text-lg text-terracotta">Technical support</span><br />Comprehensive guidance on our brand, product applications, and contraindications.</li>
            <li><span className="font-heading text-lg text-terracotta">Events &amp; education diary</span><br />The latest on upcoming industry events and webinars.</li>
            <li><span className="font-heading text-lg text-terracotta">Educational hub</span><br />Case studies, webinars, advanced scientific studies and technical sheets.</li>
            <li><span className="font-heading text-lg text-terracotta">Your referral code</span><br />A unique code and link to share with clients, generated on approval.</li>
          </ul>
        </div>
        <ApplyForm />
      </section>
    </div>
  );
}
