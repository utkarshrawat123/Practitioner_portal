'use client';

import { useRef, useState } from 'react';
import { motion, useInView, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

const NAVY = '#16233F';
const NAVY_DARK = '#101a30';
const TERRACOTTA = '#C1573D';
const CREAM = '#F3EEE1';
const CARD = '#1E2C4C';

function Grain() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ mixBlendMode: 'overlay', opacity: 0.12 }}>
      <filter id="wn-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#wn-grain)" />
    </svg>
  );
}

function WordPullUp({ text, className, style, delay = 0 }:
  { text: string; className?: string; style?: React.CSSProperties; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  const words = text.split(' ');
  return (
    <span ref={ref} className={className} style={style}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-baseline">
          <motion.span className="inline-block"
            initial={{ y: 20, opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
            transition={{ duration: 0.5, delay: delay + i * 0.08, ease: [0.22, 1, 0.36, 1] }}>
            {w}{i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

function Char({ char, progress, range }:
  { char: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.2, 1]);
  return <motion.span style={{ opacity }}>{char === ' ' ? ' ' : char}</motion.span>;
}

function ScrollReveal({ text, className, style }:
  { text: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.2'] });
  const chars = text.split('');
  return (
    <p ref={ref} className={className} style={style}>
      {chars.map((c, i) => (
        <Char key={i} char={c} progress={scrollYProgress}
          range={[i / chars.length, (i + 1) / chars.length]} />
      ))}
    </p>
  );
}

function StartButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    await fetch('/api/me/seen-welcome', { method: 'POST' });
    router.push('/dashboard');
    router.refresh();
  }
  return (
    <button onClick={start} disabled={busy}
      className="group mt-10 inline-flex items-center gap-3 rounded-full px-7 py-3 text-sm font-medium transition-all hover:gap-4 disabled:opacity-60"
      style={{ backgroundColor: TERRACOTTA, color: NAVY, fontFamily: 'var(--font-inter)' }}>
      Start Exploring
      <span className="flex h-7 w-7 items-center justify-center rounded-full transition-transform group-hover:scale-110"
        style={{ backgroundColor: NAVY, color: CREAM }}>
        <ArrowRight size={16} />
      </span>
    </button>
  );
}

export default function WelcomeExperience({ firstName }: { firstName: string | null }) {
  return (
    <div className="relative isolate" style={{ backgroundColor: NAVY, color: CREAM, fontFamily: 'var(--font-inter)' }}>
      <Grain />
      {/* Scene 1 — Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ background: `radial-gradient(circle at 70% 20%, rgba(193,87,61,0.16), ${NAVY} 45%, ${NAVY_DARK})` }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
          className="mb-10 text-sm tracking-[0.35em]"
          style={{ fontFamily: 'var(--font-fraunces)', color: CREAM }}>
          WILD NUTRITION
        </motion.div>
        <WordPullUp text={firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
          className="block max-w-5xl text-[10vw] font-light leading-[0.9] md:text-[7vw]"
          style={{ fontFamily: 'var(--font-fraunces)', color: CREAM }} />
        <motion.p initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8 max-w-lg text-base leading-relaxed"
          style={{ color: 'rgba(243,238,225,0.7)' }}>
          Lorna and the team built this platform because practitioners told us they wanted
          practical support that saves time in clinic and helps them deliver the best outcomes.
        </motion.p>
        <motion.div animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-10 text-xs uppercase tracking-[0.25em]"
          style={{ color: 'rgba(243,238,225,0.6)' }}>
          Scroll to continue
        </motion.div>
      </section>

      {/* Scene 2 — Mission */}
      <section className="relative flex min-h-screen items-center justify-center px-6 py-24">
        <div className="mx-auto w-full max-w-3xl rounded-2xl px-6 py-14 sm:px-12 sm:py-16"
          style={{ backgroundColor: CARD }}>
          <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: TERRACOTTA }}>
            Practitioner Education
          </p>
          <h2 className="mt-6 text-3xl leading-snug sm:text-4xl md:text-5xl md:leading-tight">
            <WordPullUp text="This platform was shaped by"
              style={{ fontFamily: 'var(--font-inter)', fontWeight: 400 }} />{' '}
            <WordPullUp text="Lorna Driver-Davies,"
              style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', color: TERRACOTTA }} />{' '}
            <WordPullUp text="Head of Practitioner Education at Wild Nutrition."
              style={{ fontFamily: 'var(--font-inter)', fontWeight: 400 }} />
          </h2>
          <ScrollReveal text="Our mission is to support practitioners beyond the consultation room."
            className="mt-8 text-lg leading-relaxed" style={{ color: CREAM }} />
          <StartButton />
        </div>
      </section>
    </div>
  );
}
