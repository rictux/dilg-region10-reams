import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Loader2, Printer, Search } from 'lucide-react';
import { format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { fetchAllSupabaseRows } from '../../lib/supabasePagination';
import {
  Event,
  EventTest,
  EventTestQuestion,
  EventTestSubmission,
  EventTestType,
} from '../../types/database';
import {
  EVENT_TEST_LABEL,
  EVENT_TEST_TYPES,
  choiceLetter,
  formatScorePercent,
  isPassingSubmission,
  scorePercent,
} from '../../lib/eventTests';
import { formatParticipantOfficialName } from '../../lib/participantName';

// Who took the Pre-test / Post-test, what they scored, and how much they gained.
//
// Rows cover the whole registered roster, not just the people who answered:
// the blanks are the point of the report — they are exactly who cannot receive a
// Certificate of Completion.

type RosterRow = {
  participant_id: number;
  name: string;
  office: string | null;
  role: string;
};

type ResultRow = RosterRow & {
  submissions: Partial<Record<EventTestType, EventTestSubmission>>;
};

type Filter = 'All' | 'Complete' | 'Incomplete';

const formatEventDate = (start: string, end?: string | null) => {
  if (!start) return '';
  try {
    const startDate = parseISO(start);
    const endDate = end ? parseISO(end) : startDate;
    if (!end || start === end) return format(startDate, 'MMMM d, yyyy');
    if (isSameMonth(startDate, endDate) && isSameYear(startDate, endDate)) {
      return `${format(startDate, 'MMMM d')}-${format(endDate, 'd, yyyy')}`;
    }
    if (isSameYear(startDate, endDate)) {
      return `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')}`;
    }
    return `${format(startDate, 'MMMM d, yyyy')} - ${format(endDate, 'MMMM d, yyyy')}`;
  } catch {
    return start;
  }
};

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const formatPercent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value)}%`;

const formatGain = (value: number | null) => {
  if (value === null) return '—';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
};

const TestResults: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<Event | null>(null);
  const [tests, setTests] = useState<EventTest[]>([]);
  const [questions, setQuestions] = useState<EventTestQuestion[]>([]);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  useEffect(() => {
    if (!eventId) return;
    sessionStorage.setItem('reports_selected_event_id', eventId);

    const load = async () => {
      setLoading(true);
      try {
        const numericId = parseInt(eventId, 10);

        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('event_id', numericId)
          .is('deleted_at', null)
          .single();
        if (eventError) throw eventError;
        setEvent(eventData as Event);

        const { data: testData, error: testError } = await supabase
          .from('event_tests')
          .select('*')
          .eq('event_id', numericId);
        if (testError) throw testError;

        const testRows = ((testData || []) as EventTest[]).sort(
          (a, b) => EVENT_TEST_TYPES.indexOf(a.test_type) - EVENT_TEST_TYPES.indexOf(b.test_type)
        );
        setTests(testRows);

        const roster = await fetchAllSupabaseRows<any>(() =>
          supabase
            .from('event_participants')
            .select('participant_id, role, participants (participant_id, full_name, f_name, l_name, m_initial, suffix, office)')
            .eq('event_id', numericId)
            .eq('registration_status', 'Registered')
            .order('participant_id', { ascending: true })
        );

        const testIds = testRows.map(test => test.test_id);
        let submissions: EventTestSubmission[] = [];
        if (testIds.length > 0) {
          const [submissionRows, { data: questionData, error: questionError }] = await Promise.all([
            fetchAllSupabaseRows<any>(() =>
              supabase
                .from('event_test_submissions')
                .select('*')
                .eq('event_id', numericId)
                .in('test_id', testIds)
                .order('submission_id', { ascending: true })
            ),
            supabase
              .from('event_test_questions')
              .select('*')
              .in('test_id', testIds)
              .order('position', { ascending: true }),
          ]);
          if (questionError) throw questionError;
          submissions = submissionRows as EventTestSubmission[];
          setQuestions((questionData || []) as EventTestQuestion[]);
        }

        const testTypeById = new Map(testRows.map(test => [test.test_id, test.test_type]));
        const byParticipant = new Map<number, Partial<Record<EventTestType, EventTestSubmission>>>();
        submissions.forEach(submission => {
          const testType = testTypeById.get(submission.test_id);
          if (!testType) return;
          const bucket = byParticipant.get(submission.participant_id) || {};
          bucket[testType] = submission;
          byParticipant.set(submission.participant_id, bucket);
        });

        const resultRows: ResultRow[] = roster
          .map((row: any) => {
            const person = Array.isArray(row.participants) ? row.participants[0] : row.participants;
            if (!person) return null;
            return {
              participant_id: person.participant_id,
              name: formatParticipantOfficialName(person),
              office: person.office ?? null,
              role: row.role || 'Delegate',
              submissions: byParticipant.get(person.participant_id) || {},
            };
          })
          .filter((row: ResultRow | null): row is ResultRow => row !== null)
          .sort((a, b) => a.name.localeCompare(b.name));

        setRows(resultRows);
      } catch (error: any) {
        console.error('Error loading test results:', error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [eventId]);

  const testByType = useMemo(
    () => new Map(tests.map(test => [test.test_type, test])),
    [tests]
  );

  const isComplete = (row: ResultRow) => tests.every(test => row.submissions[test.test_type]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => {
      if (query && !row.name.toLowerCase().includes(query) && !(row.office || '').toLowerCase().includes(query)) {
        return false;
      }
      if (filter === 'All') return true;
      return isComplete(row) === (filter === 'Complete');
    });
  }, [rows, search, filter, tests]);

  // ── Summary
  const summary = useMemo(() => {
    const percentsByType: Record<string, number[]> = {};
    const gains: number[] = [];

    rows.forEach(row => {
      tests.forEach(test => {
        const submission = row.submissions[test.test_type];
        if (!submission) return;
        const percent = scorePercent(Number(submission.score), Number(submission.max_score));
        if (percent === null) return;
        (percentsByType[test.test_type] ||= []).push(percent);
      });

      const pre = row.submissions.Pre;
      const post = row.submissions.Post;
      if (pre && post) {
        const prePercent = scorePercent(Number(pre.score), Number(pre.max_score));
        const postPercent = scorePercent(Number(post.score), Number(post.max_score));
        if (prePercent !== null && postPercent !== null) gains.push(postPercent - prePercent);
      }
    });

    return {
      takenByType: Object.fromEntries(
        tests.map(test => [
          test.test_type,
          rows.filter(row => row.submissions[test.test_type]).length,
        ])
      ) as Record<string, number>,
      meanByType: Object.fromEntries(
        tests.map(test => [test.test_type, mean(percentsByType[test.test_type] || [])])
      ) as Record<string, number | null>,
      meanGain: mean(gains),
      completeCount: rows.filter(isComplete).length,
    };
  }, [rows, tests]);

  const completionRate =
    rows.length === 0 ? null : (summary.completeCount / rows.length) * 100;

  // ── Per-question item analysis
  const itemAnalysis = useMemo(() => {
    const submissionsByTest = new Map<number, EventTestSubmission[]>();
    rows.forEach(row => {
      tests.forEach(test => {
        const submission = row.submissions[test.test_type];
        if (!submission) return;
        const bucket = submissionsByTest.get(test.test_id) || [];
        bucket.push(submission);
        submissionsByTest.set(test.test_id, bucket);
      });
    });

    return questions.map(question => {
      const testSubmissions = submissionsByTest.get(question.test_id) || [];
      const answered = testSubmissions.filter(
        submission => submission.answers?.[String(question.question_id)]
      );
      const correct = answered.filter(
        submission => submission.answers[String(question.question_id)] === question.correct_key
      );
      return {
        question,
        answeredCount: answered.length,
        correctCount: correct.length,
        percent: answered.length === 0 ? null : (correct.length / answered.length) * 100,
      };
    });
  }, [questions, rows, tests]);

  const downloadCsv = () => {
    const header = [
      'Name',
      'Office',
      'Role',
      ...tests.flatMap(test => [
        `${EVENT_TEST_LABEL[test.test_type]} Score`,
        `${EVENT_TEST_LABEL[test.test_type]} %`,
        `${EVENT_TEST_LABEL[test.test_type]} Submitted`,
      ]),
      'Gain',
      'Complete',
    ];

    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

    const lines = filteredRows.map(row => {
      const pre = row.submissions.Pre;
      const post = row.submissions.Post;
      const prePercent = pre ? scorePercent(Number(pre.score), Number(pre.max_score)) : null;
      const postPercent = post ? scorePercent(Number(post.score), Number(post.max_score)) : null;
      const gain = prePercent !== null && postPercent !== null ? postPercent - prePercent : null;

      return [
        escape(row.name),
        escape(row.office || ''),
        escape(row.role),
        ...tests.flatMap(test => {
          const submission = row.submissions[test.test_type];
          if (!submission) return ['', '', ''];
          return [
            `${Number(submission.score)}/${Number(submission.max_score)}`,
            String(Math.round(scorePercent(Number(submission.score), Number(submission.max_score)) ?? 0)),
            format(new Date(submission.submitted_at), 'yyyy-MM-dd HH:mm'),
          ];
        }),
        gain === null ? '' : String(Math.round(gain)),
        isComplete(row) ? 'Yes' : 'No',
      ].join(',');
    });

    const csv = [header.map(escape).join(','), ...lines].join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(event?.event_name || 'event').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_test_results.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" />
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="min-h-screen bg-[#F5F3EE] p-6">
        <button
          onClick={() => navigate('/reports')}
          className="mb-6 flex items-center gap-2 font-medium text-[#6B6860] hover:text-[#111110]"
        >
          <ArrowLeft size={20} /> Back
        </button>
        <div className="mx-auto max-w-md rounded-xl border border-[#E0DDD4] bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <ClipboardList size={32} className="text-slate-400" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-800">No tests configured</h2>
          <p className="text-sm text-slate-500">
            {event?.event_name || 'This event'} has no pre-test or post-test. Set one up from the
            event's Tests button on the Events page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F3EE] font-sans text-[#111110] print:bg-white">
      {/* Toolbar */}
      <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-[#E0DDD4] bg-white p-4 shadow-sm no-print">
        <button
          onClick={() => navigate('/reports')}
          className="flex items-center gap-2 font-medium text-[#6B6860] hover:text-[#111110]"
        >
          <ArrowLeft size={20} /> Back
        </button>
        <div className="flex items-center gap-3">
          <span className="rounded bg-[#EDEAE2] px-2 py-1 font-mono text-sm text-[#7C7A72]">
            Complete: {summary.completeCount} / {rows.length}
          </span>
          <button
            onClick={downloadCsv}
            className="rounded-lg border border-[#E0DDD4] bg-white px-4 py-2 text-sm font-medium text-[#4A4843] transition-colors hover:bg-[#F5F3EE]"
          >
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-[#111110] px-4 py-2 font-bold text-white shadow-md transition-colors hover:bg-[#2A2926]"
          >
            <Printer size={18} /> Print
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: landscape; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white; }
          .no-print { display: none !important; }
          .print-container { padding: 0 !important; margin: 0 auto !important; width: 100% !important; max-width: none !important; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
          th { border: 1px solid #000; background-color: #f1f5f9 !important; padding: 4px; font-size: 10px !important; font-weight: bold; }
          td { border-bottom: 0.5px solid #d4d4d4; padding: 4px; vertical-align: top; }
        }
      `}</style>

      <div className="print-container mx-auto max-w-7xl px-4 pb-16 pt-24 print:pt-0">
        {/* Report header */}
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-widest text-[#9A9890]">Pre-test / Post-test Results</p>
          <h1 className="mt-1 text-2xl font-bold">{event?.event_name}</h1>
          <p className="text-sm text-[#6B6860]">
            {formatEventDate(event?.start_date || '', event?.end_date)}
            {event?.venue ? ` · ${event.venue}` : ''}
          </p>
        </div>

        {/* Summary tiles */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tests.map(test => (
            <React.Fragment key={test.test_id}>
              <div className="rounded-xl border border-[#E0DDD4] bg-white p-4">
                <p className="text-[11px] uppercase tracking-wide text-[#9A9890]">
                  {EVENT_TEST_LABEL[test.test_type]} taken
                </p>
                <p className="mt-1 font-mono text-2xl font-bold">
                  {summary.takenByType[test.test_type] ?? 0}
                  <span className="text-base text-[#9A9890]"> / {rows.length}</span>
                </p>
              </div>
              <div className="rounded-xl border border-[#E0DDD4] bg-white p-4">
                <p className="text-[11px] uppercase tracking-wide text-[#9A9890]">
                  {EVENT_TEST_LABEL[test.test_type]} average
                </p>
                <p className="mt-1 font-mono text-2xl font-bold">
                  {formatPercent(summary.meanByType[test.test_type] ?? null)}
                </p>
              </div>
            </React.Fragment>
          ))}
          <div className="col-span-2 rounded-xl border border-[#E0DDD4] bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-[#9A9890]">
              Completed {tests.length === 1 ? 'the test' : 'all tests'}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-600">
              {summary.completeCount}
              <span className="text-base text-[#9A9890]"> / {rows.length}</span>
            </p>
            <p className="mt-1 text-[11px] text-[#9A9890]">
              {formatPercent(completionRate)} of the roster
              {summary.completeCount < rows.length
                ? ` · ${rows.length - summary.completeCount} still incomplete`
                : ''}
            </p>
          </div>
          {tests.length === 2 && (
            <div className="col-span-2 rounded-xl border border-[#E0DDD4] bg-white p-4">
              <p className="text-[11px] uppercase tracking-wide text-[#9A9890]">
                Average gain (post − pre, took both)
              </p>
              <p className={`mt-1 font-mono text-2xl font-bold ${
                (summary.meanGain ?? 0) > 0 ? 'text-emerald-600' : (summary.meanGain ?? 0) < 0 ? 'text-red-600' : ''
              }`}>
                {formatGain(summary.meanGain)}
              </p>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mb-3 flex flex-wrap items-center gap-3 no-print">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9890]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or office…"
              className="w-full rounded-lg border border-[#E0DDD4] bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-[#E0DDD4] bg-white p-1">
            {(['All', 'Complete', 'Incomplete'] as Filter[]).map(option => (
              <button
                key={option}
                onClick={() => setFilter(option)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === option ? 'bg-[#111110] text-white' : 'text-[#6B6860] hover:bg-[#F5F3EE]'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <span className="font-mono text-xs text-[#9A9890]">{filteredRows.length} shown</span>
        </div>

        {/* Results table */}
        <div className="overflow-x-auto rounded-xl border border-[#E0DDD4] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E0DDD4] bg-[#F5F3EE] text-left text-xs uppercase tracking-wide text-[#6B6860]">
                <th className="px-3 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Name</th>
                <th className="px-3 py-2.5 font-semibold">Office</th>
                {tests.map(test => (
                  <th key={test.test_id} className="px-3 py-2.5 text-center font-semibold">
                    {EVENT_TEST_LABEL[test.test_type]}
                  </th>
                ))}
                {tests.length === 2 && <th className="px-3 py-2.5 text-center font-semibold">Gain</th>}
                <th className="px-3 py-2.5 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5 + tests.length} className="px-3 py-10 text-center text-sm text-[#9A9890]">
                    No participants match this filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => {
                  const pre = row.submissions.Pre;
                  const post = row.submissions.Post;
                  const prePercent = pre ? scorePercent(Number(pre.score), Number(pre.max_score)) : null;
                  const postPercent = post ? scorePercent(Number(post.score), Number(post.max_score)) : null;
                  const gain = prePercent !== null && postPercent !== null ? postPercent - prePercent : null;
                  const complete = isComplete(row);

                  return (
                    <tr key={row.participant_id} className="border-b border-[#EDEAE2] last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-[#9A9890]">{index + 1}</td>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-xs text-[#6B6860]">{row.office || '—'}</td>

                      {tests.map(test => {
                        const submission = row.submissions[test.test_type];
                        if (!submission) {
                          return (
                            <td key={test.test_id} className="px-3 py-2 text-center text-xs text-[#C5C2BA]">
                              Not taken
                            </td>
                          );
                        }
                        const passing = isPassingSubmission(testByType.get(test.test_type), submission);
                        return (
                          <td key={test.test_id} className="px-3 py-2 text-center">
                            <span className="font-mono font-medium">
                              {Number(submission.score)}/{Number(submission.max_score)}
                            </span>
                            <span className="ml-1.5 font-mono text-xs text-[#9A9890]">
                              {formatScorePercent(Number(submission.score), Number(submission.max_score))}
                            </span>
                            {passing !== null && (
                              <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                passing
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-red-50 text-red-600'
                              }`}>
                                {passing ? 'Pass' : 'Fail'}
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {tests.length === 2 && (
                        <td className={`px-3 py-2 text-center font-mono text-xs font-medium ${
                          gain === null ? 'text-[#C5C2BA]' : gain > 0 ? 'text-emerald-600' : gain < 0 ? 'text-red-600' : 'text-[#6B6860]'
                        }`}>
                          {formatGain(gain)}
                        </td>
                      )}

                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          complete
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}>
                          {complete ? 'Complete' : 'Incomplete'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-[#9A9890]">
          “Complete” means every test this event runs was submitted. That — not the score — is what a
          Certificate of Completion requires.
        </p>

        {/* Item analysis */}
        {itemAnalysis.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 text-sm font-bold text-[#4A4843]">Per-question results</h2>
            <div className="space-y-6">
              {tests.map(test => {
                const testQuestions = itemAnalysis.filter(item => item.question.test_id === test.test_id);
                if (testQuestions.length === 0) return null;
                return (
                  <div key={test.test_id} className="overflow-x-auto rounded-xl border border-[#E0DDD4] bg-white">
                    <p className="border-b border-[#E0DDD4] bg-[#F5F3EE] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#6B6860]">
                      {EVENT_TEST_LABEL[test.test_type]} — {test.title}
                    </p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#EDEAE2] text-left text-xs text-[#9A9890]">
                          <th className="px-3 py-2 font-medium">#</th>
                          <th className="px-3 py-2 font-medium">Question</th>
                          <th className="px-3 py-2 font-medium">Correct answer</th>
                          <th className="px-3 py-2 text-center font-medium">Correct</th>
                          <th className="px-3 py-2 text-center font-medium">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {testQuestions.map(item => {
                          const correctChoice = item.question.choices.find(
                            choice => choice.key === item.question.correct_key
                          );
                          return (
                            <tr key={item.question.question_id} className="border-b border-[#EDEAE2] last:border-0">
                              <td className="px-3 py-2 font-mono text-xs text-[#9A9890]">
                                {item.question.position}
                              </td>
                              <td className="px-3 py-2">{item.question.question_text}</td>
                              <td className="px-3 py-2 text-xs text-[#6B6860]">
                                <span className="font-mono">{choiceLetter(item.question.correct_key)}</span>
                                {correctChoice ? ` — ${correctChoice.label}` : ''}
                              </td>
                              <td className="px-3 py-2 text-center font-mono text-xs">
                                {item.correctCount}/{item.answeredCount}
                              </td>
                              <td className={`px-3 py-2 text-center font-mono text-xs font-medium ${
                                item.percent === null ? 'text-[#C5C2BA]'
                                  : item.percent >= 75 ? 'text-emerald-600'
                                  : item.percent >= 50 ? 'text-amber-600'
                                  : 'text-red-600'
                              }`}>
                                {formatPercent(item.percent)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestResults;
