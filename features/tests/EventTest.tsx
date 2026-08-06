import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  AlertCircle, Calendar, CheckCircle, ClipboardList, Info, Loader2, Lock,
  MapPin, Search, User,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchAllSupabaseRows } from '../../lib/supabasePagination';
import { EventTestPublicView, EventTestSubmitResult } from '../../types/database';
import {
  EVENT_TEST_LABEL,
  choiceLetter,
  formatScorePercent,
  parseEventTestSlug,
} from '../../lib/eventTests';
import { formatParticipantOfficialName } from '../../lib/participantName';

// Public Pre-test / Post-test page: /test/:eventId/:testType
//
// No login. The participant picks their name from this event's roster, answers
// every question once, and the score is computed server-side — the questions
// arrive from get_event_test with the answer key stripped, so nothing on this
// page knows which choice is correct.

type RosterEntry = {
  participant_id: number;
  full_name: string;
  office: string | null;
  position: string | null;
};

const formatEventDate = (start: string, end: string) => {
  try {
    const startDate = parseISO(start);
    const endDate = end ? parseISO(end) : startDate;
    if (!end || start === end) return format(startDate, 'MMM. d, yyyy');
    return `${format(startDate, 'MMM. d, yyyy')} - ${format(endDate, 'MMM. d, yyyy')}`;
  } catch {
    return start;
  }
};

/**
 * Case- and accent-insensitive haystack for the name filter, so "Peña" is found
 * by typing "pena". The range is the Unicode combining-marks block that NFD
 * splits accents into.
 */
const COMBINING_MARKS = /[̀-ͯ]/g;

const searchKey = (value: string) =>
  value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();

const CenteredCard: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
    <div className="bg-card p-8 rounded-xl shadow-md text-center max-w-md w-full border border-slate-100">
      {children}
    </div>
  </div>
);

const EventTest: React.FC = () => {
  const { eventId, testType: testTypeSlug } = useParams<{ eventId: string; testType: string }>();
  const [searchParams] = useSearchParams();

  const testType = parseEventTestSlug(testTypeSlug);
  const numericEventId = Number(eventId);

  const [test, setTest] = useState<EventTestPublicView | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nameQuery, setNameQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [participant, setParticipant] = useState<RosterEntry | null>(null);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<EventTestSubmitResult | null>(null);

  const suggestionsRef = useRef<HTMLDivElement>(null);
  const questionsRef = useRef<HTMLDivElement>(null);

  // ── Load the test and this event's roster
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!testType || !Number.isFinite(numericEventId)) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_event_test', {
          p_event_id: numericEventId,
          p_test_type: testType,
        });
        if (error) throw error;
        if (cancelled) return;

        if (!data) {
          setTest(null);
          return;
        }
        setTest(data as EventTestPublicView);

        // The whole roster is loaded once and filtered in the browser: the name
        // box must only ever offer people registered for THIS event, and doing
        // the matching locally keeps that guarantee simple and the typing instant.
        const rows = await fetchAllSupabaseRows<any>(() =>
          supabase
            .from('event_participants')
            .select('participant_id, participants (participant_id, full_name, f_name, l_name, m_initial, suffix, office, position)')
            .eq('event_id', numericEventId)
            .eq('registration_status', 'Registered')
            .order('participant_id', { ascending: true })
        );
        if (cancelled) return;

        const entries: RosterEntry[] = rows
          .map((row: any) => {
            const person = Array.isArray(row.participants) ? row.participants[0] : row.participants;
            if (!person) return null;
            return {
              participant_id: person.participant_id,
              full_name: formatParticipantOfficialName(person),
              office: person.office ?? null,
              position: person.position ?? null,
            };
          })
          .filter((entry: RosterEntry | null): entry is RosterEntry => entry !== null)
          .sort((a, b) => a.full_name.localeCompare(b.full_name));

        setRoster(entries);
      } catch (error: any) {
        console.error('Error loading event test:', error);
        if (!cancelled) setLoadError(error?.message || 'Unable to load this test.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [numericEventId, testType]);

  // Arriving from a participant badge QR skips the name step.
  useEffect(() => {
    const participantParam = searchParams.get('participant');
    if (!participantParam || roster.length === 0 || participant) return;
    const match = roster.find(entry => entry.participant_id === Number(participantParam));
    if (match) {
      setParticipant(match);
      setNameQuery(match.full_name);
    }
  }, [searchParams, roster, participant]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    const query = searchKey(nameQuery.trim());
    if (query.length < 2) return [];
    // Every typed word must appear somewhere in the name, so "dela cruz juan"
    // finds "Juan Dela Cruz" regardless of the order they type it in.
    const terms = query.split(/\s+/);
    return roster
      .filter(entry => {
        const haystack = searchKey(`${entry.full_name} ${entry.office || ''}`);
        return terms.every(term => haystack.includes(term));
      })
      .slice(0, 8);
  }, [nameQuery, roster]);

  const selectParticipant = (entry: RosterEntry) => {
    setParticipant(entry);
    setNameQuery(entry.full_name);
    setShowSuggestions(false);
    setSubmitError(null);
    // Move on to the questions rather than leaving the page looking unchanged.
    requestAnimationFrame(() => {
      questionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const clearParticipant = () => {
    setParticipant(null);
    setNameQuery('');
    setAnswers({});
    setShowSuggestions(true);
  };

  const questions = test?.questions ?? [];
  const answeredCount = questions.filter(question => answers[question.question_id]).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  const handleSubmit = useCallback(async () => {
    if (!test || !participant || !testType) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // question_id → choice key, which is the shape submit_event_test scores against.
      const payload: Record<string, string> = {};
      questions.forEach(question => {
        const choiceKey = answers[question.question_id];
        if (choiceKey) payload[String(question.question_id)] = choiceKey;
      });

      const { data, error } = await supabase.rpc('submit_event_test', {
        p_event_id: test.event_id,
        p_test_type: testType,
        p_participant_id: participant.participant_id,
        p_answers: payload,
      });
      if (error) throw error;

      setResult(data as EventTestSubmitResult);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      console.error('Error submitting event test:', error);
      setSubmitError(error?.message || 'Unable to submit your answers. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [answers, participant, test, testType]);

  // ── Screens

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!testType || !test) {
    return (
      <CenteredCard>
        <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={32} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Test not found</h2>
        <p className="text-slate-500">
          {loadError || 'This link is no longer valid, or the test has not been set up for this event.'}
        </p>
      </CenteredCard>
    );
  }

  if (result) {
    const showScore = test.show_score;
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 flex justify-center">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-xl overflow-hidden">
          <div className={`${result.already_submitted ? 'bg-amber-500' : 'bg-green-600'} px-6 py-8 text-center text-white`}>
            <div className="flex justify-center mb-4">
              <div className="bg-white/20 p-3 rounded-full">
                {result.already_submitted
                  ? <Info size={48} className="text-white" />
                  : <CheckCircle size={48} className="text-white" />}
              </div>
            </div>
            <h2 className="text-3xl font-bold mb-2">
              {result.already_submitted ? 'Already Submitted' : 'Answers Received'}
            </h2>
            <p className={result.already_submitted ? 'text-amber-100' : 'text-green-100'}>
              {EVENT_TEST_LABEL[test.test_type]} — {test.event_name}
            </p>
          </div>

          <div className="p-8 text-center">
            <p className="font-bold text-slate-900 text-lg">{participant?.full_name}</p>
            {result.already_submitted && (
              <p className="text-sm text-slate-500 mt-2">
                You have already taken this test. Only your first submission is recorded.
              </p>
            )}

            {showScore ? (
              <div className="mt-6 rounded-xl border-2 border-slate-100 p-6">
                <p className="text-xs uppercase font-medium text-slate-400 mb-1 tracking-wide">Your score</p>
                <p className="text-4xl font-bold text-slate-900 font-mono">
                  {Number(result.score)}
                  <span className="text-2xl text-slate-400"> / {Number(result.max_score)}</span>
                </p>
                <p className="text-sm text-indigo-600 font-semibold mt-1">
                  {formatScorePercent(Number(result.score), Number(result.max_score))}
                </p>
              </div>
            ) : (
              <p className="mt-6 text-slate-500 text-sm">
                Your answers have been recorded. Scores are released by the organizer.
              </p>
            )}

            <p className="mt-6 text-xs text-slate-400">
              You may now close this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!test.is_open) {
    return (
      <CenteredCard>
        <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          {EVENT_TEST_LABEL[test.test_type]} Closed
        </h2>
        <p className="text-slate-500">
          The {EVENT_TEST_LABEL[test.test_type].toLowerCase()} for{' '}
          <strong className="text-slate-700">{test.event_name}</strong> is no longer accepting answers.
        </p>
        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-slate-400 text-xs uppercase font-medium mb-1">Contact Organizer</p>
          <p className="text-indigo-600 font-medium text-sm">
            Please contact the event organizer for assistance.
          </p>
        </div>
      </CenteredCard>
    );
  }

  if (questions.length === 0) {
    return (
      <CenteredCard>
        <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <ClipboardList size={32} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Not ready yet</h2>
        <p className="text-slate-500">
          This {EVENT_TEST_LABEL[test.test_type].toLowerCase()} has no questions yet. Please check back later.
        </p>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 flex justify-center">
      <div className="max-w-3xl w-full bg-card rounded-2xl shadow-xl overflow-hidden border border-slate-100">

        {/* Header */}
        <div className="bg-sidebar p-6 sm:p-8 text-white relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <div className="absolute -top-16 -right-16 w-56 h-56 bg-indigo-600/25 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium mb-3 font-mono">
              {EVENT_TEST_LABEL[test.test_type]}
            </span>
            <h1 className="text-xl sm:text-2xl font-semibold leading-snug mb-1">{test.title}</h1>
            <p className="text-white/60 text-sm mb-3">{test.event_name}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-white/50 text-sm">
              <div className="flex items-center gap-1.5">
                <Calendar size={14} />
                <span className="font-mono">{formatEventDate(test.start_date, test.end_date)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin size={14} />
                <span>{test.venue}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {test.instructions && (
            <div className="mb-6 bg-indigo-50 border border-indigo-100 p-4 rounded-lg text-sm text-indigo-800 whitespace-pre-line">
              {test.instructions}
            </div>
          )}

          {/* Step 1 — name */}
          <div className="mb-8">
            <label htmlFor="test-name" className="block text-sm font-semibold text-slate-800 mb-1">
              Your name
              <span className="text-red-500" aria-hidden="true"> *</span>
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Start typing and pick your name from the list of participants registered for this event.
            </p>

            <div className="relative" ref={suggestionsRef}>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="test-name"
                  type="text"
                  value={nameQuery}
                  onChange={e => {
                    setNameQuery(e.target.value);
                    setParticipant(null);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  autoComplete="off"
                  placeholder="Type your last name…"
                  className={`w-full rounded-lg border-2 py-3 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 ${
                    participant
                      ? 'border-emerald-300 bg-emerald-50/40 focus:border-emerald-400 focus:ring-emerald-400'
                      : 'border-slate-300 focus:border-indigo-400 focus:ring-indigo-400'
                  }`}
                />
                {participant && (
                  <CheckCircle size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                )}
              </div>

              {showSuggestions && !participant && nameQuery.trim().length >= 2 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-card shadow-lg overflow-hidden">
                  {suggestions.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-500">
                      No participant matches that name in this event. Check the spelling, or ask the
                      organizer to add you.
                    </p>
                  ) : (
                    suggestions.map(entry => (
                      <button
                        key={entry.participant_id}
                        type="button"
                        onClick={() => selectParticipant(entry)}
                        className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-indigo-50"
                      >
                        <User size={16} className="mt-0.5 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {entry.full_name}
                          </span>
                          {(entry.position || entry.office) && (
                            <span className="block truncate text-xs text-slate-500">
                              {[entry.position, entry.office].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {participant && (
              <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-emerald-700">
                  Answering as <strong>{participant.full_name}</strong>
                </span>
                <button
                  type="button"
                  onClick={clearParticipant}
                  className="shrink-0 text-slate-500 hover:text-slate-700 hover:underline"
                >
                  Not you?
                </button>
              </div>
            )}
          </div>

          {/* Step 2 — questions */}
          <div ref={questionsRef} className={participant ? '' : 'opacity-50 pointer-events-none select-none'}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Questions</h2>
              <span className="font-mono text-xs text-slate-400">
                {answeredCount} / {questions.length} answered
              </span>
            </div>

            <div className="space-y-5">
              {questions.map((question, index) => (
                <fieldset key={question.question_id} className="rounded-xl border border-slate-200 p-4">
                  <legend className="sr-only">Question {index + 1}</legend>
                  <p className="mb-3 flex gap-2 text-sm font-medium text-slate-800">
                    <span className="font-mono text-slate-400">{index + 1}.</span>
                    <span className="whitespace-pre-line">{question.question_text}</span>
                  </p>
                  <div className="space-y-2 pl-6">
                    {question.choices.map(choice => {
                      const selected = answers[question.question_id] === choice.key;
                      return (
                        <label
                          key={choice.key}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3 py-2.5 text-sm transition-colors ${
                            selected
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                              : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${question.question_id}`}
                            checked={selected}
                            onChange={() =>
                              setAnswers(current => ({ ...current, [question.question_id]: choice.key }))
                            }
                            className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                          />
                          <span className="font-mono text-xs text-slate-400">{choiceLetter(choice.key)}</span>
                          <span className="min-w-0 flex-1">{choice.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            {submitError && (
              <div className="mt-6 rounded border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!participant || !allAnswered || submitting}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 font-bold text-white shadow-lg transition-colors hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {submitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
              {submitting ? 'Submitting…' : 'Submit Answers'}
            </button>

            <p className="mt-3 text-center text-xs text-slate-400">
              {!participant
                ? 'Select your name to begin.'
                : allAnswered
                  ? 'You can only submit once.'
                  : `Answer all ${questions.length} questions to submit.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventTest;
