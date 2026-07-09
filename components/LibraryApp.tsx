'use client';

import { useCallback, useEffect, useState } from 'react';
import { TOPICS } from '@/lib/lessons/topics';

interface Quiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface Lesson {
  id: number; title: string; summary: string; takeaways: string[]; quiz: Quiz; topics: string[];
}

const card = 'border border-stone bg-white p-6';
const label = 'text-xs uppercase tracking-[0.15em] text-ink2/70';
const topicLabel = (slug: string) => TOPICS.find((t) => t.slug === slug)?.label ?? slug;

function LessonDetail({
  lesson, completed, onToggle, onBack,
}: { lesson: Lesson; completed: boolean; onToggle: () => void; onBack: () => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  const isCorrect = choice === lesson.quiz.correctIndex;

  return (
    <div>
      <button onClick={onBack} className="text-xs uppercase tracking-[0.15em] text-ink2/70 underline hover:text-terracotta">
        ← Back to library
      </button>
      <div className={`${card} mt-4`}>
        <div className="flex flex-wrap gap-2">
          {lesson.topics.map((t) => (
            <span key={t} className="bg-sage/40 px-3 py-1 text-xs uppercase tracking-[0.1em] text-forest">
              {topicLabel(t)}
            </span>
          ))}
        </div>
        <h1 className="mt-4 font-heading text-3xl text-ink">{lesson.title}</h1>
        <p className="mt-4 whitespace-pre-line leading-relaxed text-ink2/90">{lesson.summary}</p>

        <h2 className="mt-6 font-heading text-xl text-ink">Key takeaways</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-ink2/90">
          {lesson.takeaways.map((t, i) => <li key={i}>{t}</li>)}
        </ul>

        <div className="mt-6 bg-cream p-5">
          <p className={label}>Quick self-check</p>
          <p className="mt-2 font-semibold text-ink2">{lesson.quiz.question}</p>
          <div className="mt-3 space-y-2">
            {lesson.quiz.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => setChoice(i)}
                className={`block w-full border px-4 py-2 text-left text-sm ${
                  choice === null ? 'border-stone bg-white hover:border-terracotta'
                  : i === lesson.quiz.correctIndex ? 'border-forest bg-forest/10'
                  : i === choice ? 'border-terracotta bg-terracotta/10' : 'border-stone bg-white'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {choice !== null && (
            <p className={`mt-3 text-sm ${isCorrect ? 'text-forest' : 'text-terracotta'}`}>
              {isCorrect ? 'Correct. ' : 'Not quite. '}{lesson.quiz.explanation}
            </p>
          )}
        </div>

        <button
          onClick={onToggle}
          className={`mt-6 px-6 py-3 text-xs uppercase tracking-[0.2em] ${
            completed ? 'border border-forest text-forest' : 'bg-ink text-cream hover:bg-terracotta'
          }`}
        >
          {completed ? 'Completed ✓ — mark incomplete' : 'Mark as complete'}
        </button>
      </div>
    </div>
  );
}

export default function LibraryApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [topic, setTopic] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (topic) params.set('topic', topic);
    if (q) params.set('q', q);
    const res = await fetch(`/api/library?${params.toString()}`);
    if (res.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    const body = await res.json();
    setLessons(body.lessons);
    setCompleted(new Set(body.completedIds));
  }, [topic, q]);

  useEffect(() => { load(); }, [load]);

  async function toggle(id: number) {
    const res = await fetch(`/api/library/${id}/complete`, { method: 'POST' });
    if (res.ok) {
      const { completed: nowComplete } = await res.json();
      setCompleted((prev) => {
        const next = new Set(prev);
        if (nowComplete) next.add(id); else next.delete(id);
        return next;
      });
    }
  }

  if (authed === false) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="font-heading text-3xl text-ink">Learning Library</h1>
        <p className="mt-4 text-ink2/80">
          Please <a href="/dashboard" className="text-terracotta underline">log in to your dashboard</a> to access the library.
        </p>
      </div>
    );
  }

  const open = lessons.find((l) => l.id === openId) ?? null;
  // Topics present in the current result set, for filter chips.
  const availableTopics = TOPICS.filter((t) => lessons.some((l) => l.topics.includes(t.slug)) || t.slug === topic);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      {open ? (
        <LessonDetail
          lesson={open}
          completed={completed.has(open.id)}
          onToggle={() => toggle(open.id)}
          onBack={() => setOpenId(null)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className={label}>Practitioner tools</p>
              <h1 className="mt-1 font-heading text-3xl text-ink md:text-4xl">Learning Library</h1>
            </div>
            <a href="/dashboard" className="text-xs uppercase tracking-[0.15em] text-ink2/70 underline hover:text-terracotta">
              ← Dashboard
            </a>
          </div>

          <div className={`${card} mt-6`}>
            <label htmlFor="q" className={label}>Search</label>
            <input
              id="q" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search lessons…"
              className="mt-1.5 w-full border border-stone px-4 py-3 text-ink2 focus:border-terracotta focus:outline-none"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setTopic('')}
                className={`px-3 py-1 text-xs uppercase tracking-[0.1em] ${
                  topic === '' ? 'bg-terracotta text-cream' : 'bg-stone/50 text-ink2/70'
                }`}
              >
                All topics
              </button>
              {availableTopics.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => setTopic(t.slug)}
                  className={`px-3 py-1 text-xs uppercase tracking-[0.1em] ${
                    topic === t.slug ? 'bg-terracotta text-cream' : 'bg-stone/50 text-ink2/70'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {lessons.map((l) => (
              <button
                key={l.id}
                onClick={() => setOpenId(l.id)}
                className={`${card} block w-full text-left transition-colors hover:border-terracotta`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-heading text-xl text-ink">{l.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-ink2/80">{l.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {l.topics.map((t) => (
                        <span key={t} className="text-xs uppercase tracking-[0.1em] text-forest">{topicLabel(t)}</span>
                      ))}
                    </div>
                  </div>
                  {completed.has(l.id) && (
                    <span className="whitespace-nowrap text-xs uppercase tracking-[0.15em] text-forest">Completed ✓</span>
                  )}
                </div>
              </button>
            ))}
            {lessons.length === 0 && (
              <div className={`${card} text-center text-ink2/70`}>
                No published lessons match your filters yet.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
