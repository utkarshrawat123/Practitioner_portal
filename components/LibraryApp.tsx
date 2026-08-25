'use client';

import { useCallback, useEffect, useState } from 'react';
import { TOPICS } from '@/lib/lessons/topics';
import { Button, Card, Empty, GhostButton, Label, Pill, inputClass } from '@/components/ui';

interface Quiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface Lesson {
  id: number; title: string; summary: string; takeaways: string[]; quiz: Quiz; topics: string[];
}

const topicLabel = (slug: string) => TOPICS.find((t) => t.slug === slug)?.label ?? slug;

function LessonDetail({
  lesson, completed, onToggle, onBack,
}: { lesson: Lesson; completed: boolean; onToggle: () => void; onBack: () => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  const isCorrect = choice === lesson.quiz.correctIndex;

  return (
    <div>
      <button
        onClick={onBack}
        className="group inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label text-ink2/55 transition-colors hover:text-terracotta"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">←</span> Back to library
      </button>

      <Card className="mt-5 p-7 lg:p-9">
        <div className="flex flex-wrap gap-2">
          {lesson.topics.map((t) => <Pill key={t} tone="sage">{topicLabel(t)}</Pill>)}
        </div>
        <h1 className="mt-4 font-heading text-[30px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[36px]">
          {lesson.title}
        </h1>
        <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink2/85">{lesson.summary}</p>

        <h2 className="mt-8 font-heading text-[22px] text-ink">Key takeaways</h2>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-[15px] leading-relaxed text-ink2/85">
          {lesson.takeaways.map((t, i) => <li key={i}>{t}</li>)}
        </ul>

        <div className="mt-8 rounded-card bg-blush p-6">
          <Label>Quick self-check</Label>
          <p className="mt-2 text-[15px] font-semibold text-ink">{lesson.quiz.question}</p>
          <div className="mt-4 space-y-2">
            {lesson.quiz.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => setChoice(i)}
                className={`block w-full rounded-xl px-4 py-3 text-left text-[14px] transition-all ${
                  choice === null
                    ? 'bg-white text-ink2 shadow-card hover:shadow-lift'
                    : i === lesson.quiz.correctIndex
                      ? 'bg-sage-pale text-ink ring-1 ring-olive/50'
                      : i === choice
                        ? 'bg-terracotta-light/35 text-ink ring-1 ring-terracotta/40'
                        : 'bg-white/60 text-ink2/70'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {choice !== null && (
            <p className={`mt-4 text-[14px] leading-relaxed ${isCorrect ? 'text-olive' : 'text-terracotta'}`}>
              {isCorrect ? 'Correct. ' : 'Not quite. '}{lesson.quiz.explanation}
            </p>
          )}
        </div>

        <div className="mt-7">
          {completed ? (
            <GhostButton onClick={onToggle}>Completed ✓ — mark incomplete</GhostButton>
          ) : (
            <Button onClick={onToggle}>Mark as complete</Button>
          )}
        </div>
      </Card>
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
        <h1 className="font-heading text-[34px] text-ink">Learning Library</h1>
        <p className="mt-4 text-[15px] text-ink2/75">
          Please <a href="/dashboard" className="text-terracotta underline">log in to your dashboard</a> to access the library.
        </p>
      </div>
    );
  }

  const open = lessons.find((l) => l.id === openId) ?? null;
  // Topics present in the current result set, for filter chips.
  const availableTopics = TOPICS.filter((t) => lessons.some((l) => l.topics.includes(t.slug)) || t.slug === topic);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-10 lg:py-12">
      {open ? (
        <LessonDetail
          lesson={open}
          completed={completed.has(open.id)}
          onToggle={() => toggle(open.id)}
          onBack={() => setOpenId(null)}
        />
      ) : (
        <>
          <Label>Practitioner tools</Label>
          <h1 className="mt-2 font-heading text-[34px] leading-[1.15] tracking-[-0.01em] text-ink lg:text-[42px]">
            Lessons
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink2/75">
            Short, evidence-led lessons with a quick self-check at the end.
          </p>

          <Card className="mt-8 p-6">
            <label htmlFor="q" className="text-[11px] font-medium uppercase tracking-label text-ink2/55">
              Search
            </label>
            <input
              id="q" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search lessons…"
              className={inputClass}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setTopic('')}
                aria-pressed={topic === ''}
                className={`rounded-pill px-4 py-1.5 text-[13px] transition-colors ${
                  topic === '' ? 'bg-terracotta-mid text-white' : 'bg-blush text-ink2 hover:text-ink'
                }`}
              >
                All topics
              </button>
              {availableTopics.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => setTopic(t.slug)}
                  aria-pressed={topic === t.slug}
                  className={`rounded-pill px-4 py-1.5 text-[13px] transition-colors ${
                    topic === t.slug ? 'bg-terracotta-mid text-white' : 'bg-blush text-ink2 hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Card>

          <div className="mt-6 space-y-4">
            {lessons.map((l) => (
              <button
                key={l.id}
                onClick={() => setOpenId(l.id)}
                className="block w-full rounded-card bg-white p-6 text-left shadow-card transition-shadow hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-heading text-[21px] leading-snug text-ink">{l.title}</h2>
                    <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-ink2/70">{l.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {l.topics.map((t) => <Pill key={t} tone="sage">{topicLabel(t)}</Pill>)}
                    </div>
                  </div>
                  {completed.has(l.id) && (
                    <span className="shrink-0"><Pill tone="outline">Completed ✓</Pill></span>
                  )}
                </div>
              </button>
            ))}
            {lessons.length === 0 && <Empty>No published lessons match your filters yet.</Empty>}
          </div>
        </>
      )}
    </div>
  );
}
