import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { toast } from 'sonner';
import {
  AlertTriangle, Check, ChevronDown, Copy, CopyPlus, GripVertical, Loader2,
  Plus, QrCode, Shuffle, Trash2, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  Event,
  EventTest,
  EventTestQuestion,
  EventTestType,
} from '../../types/database';
import {
  CHOICE_KEYS,
  DEFAULT_EVENT_TEST_TITLE,
  DraftQuestion,
  EVENT_TEST_LABEL,
  EVENT_TEST_TYPES,
  MAX_CHOICES,
  MIN_CHOICES,
  buildEventTestLink,
  choiceLetter,
  validateDraftQuestions,
} from '../../lib/eventTests';
import { downloadQrCodePng, qrFileSlug } from '../../lib/qrDownload';

// The Pre-test / Post-test editor for one event.
//
// A test exists only while its `event_tests` row does, so "enabled" here is the
// presence of that row. Removing a test is therefore a delete, and is refused
// once submissions exist — closing it is the non-destructive way to stop new
// entries.

type DraftTest = {
  /** Set once the test has been saved; undefined while it is only a draft. */
  test_id?: number;
  enabled: boolean;
  title: string;
  instructions: string;
  passingScore: string;
  isOpen: boolean;
  showScore: boolean;
  questions: DraftQuestion[];
};

type Props = {
  event: Event;
  onClose: () => void;
  /** Lets the parent refresh anything keyed on whether the event has tests. */
  onSaved?: () => void;
};

const emptyQuestion = (): DraftQuestion => ({
  question_text: '',
  choices: CHOICE_KEYS.slice(0, 4).map(key => ({ key, label: '' })),
  correct_key: CHOICE_KEYS[0],
  points: 1,
});

const emptyDraft = (testType: EventTestType): DraftTest => ({
  enabled: false,
  title: DEFAULT_EVENT_TEST_TITLE[testType],
  instructions: '',
  passingScore: '',
  isOpen: true,
  showScore: true,
  questions: [emptyQuestion()],
});

const EventTestBuilder: React.FC<Props> = ({ event, onClose, onSaved }) => {
  const [activeType, setActiveType] = useState<EventTestType>('Pre');
  const [drafts, setDrafts] = useState<Record<EventTestType, DraftTest>>({
    Pre: emptyDraft('Pre'),
    Post: emptyDraft('Post'),
  });
  /** Submission counts per test, so destructive edits can be warned about. */
  const [submissionCounts, setSubmissionCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedType, setCopiedType] = useState<EventTestType | null>(null);
  const [downloadingQr, setDownloadingQr] = useState(false);
  /** Post-test only: whether pulling the pre-test's questions also reorders them. */
  const [shuffleOnPull, setShuffleOnPull] = useState(true);
  const [shuffleChoicesOnPull, setShuffleChoicesOnPull] = useState(true);
  const [confirmingPull, setConfirmingPull] = useState(false);
  const [pulledFromPre, setPulledFromPre] = useState(false);

  const qrRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const draft = drafts[activeType];

  const patchDraft = useCallback(
    (testType: EventTestType, patch: Partial<DraftTest>) =>
      setDrafts(current => ({ ...current, [testType]: { ...current[testType], ...patch } })),
    []
  );

  const patchQuestion = useCallback(
    (index: number, patch: Partial<DraftQuestion>) =>
      setDrafts(current => {
        const questions = current[activeType].questions.map((question, i) =>
          i === index ? { ...question, ...patch } : question
        );
        return { ...current, [activeType]: { ...current[activeType], questions } };
      }),
    [activeType]
  );

  // ── Load
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data: tests, error: testError } = await supabase
          .from('event_tests')
          .select('*')
          .eq('event_id', event.event_id);
        if (testError) throw testError;

        const testRows = (tests || []) as EventTest[];
        const testIds = testRows.map(test => test.test_id);

        let questionRows: EventTestQuestion[] = [];
        let counts: Record<number, number> = {};

        if (testIds.length > 0) {
          const [{ data: questions, error: questionError }, { data: submissions, error: submissionError }] =
            await Promise.all([
              supabase
                .from('event_test_questions')
                .select('*')
                .in('test_id', testIds)
                .order('position', { ascending: true }),
              supabase
                .from('event_test_submissions')
                .select('test_id')
                .in('test_id', testIds),
            ]);
          if (questionError) throw questionError;
          if (submissionError) throw submissionError;

          questionRows = (questions || []) as EventTestQuestion[];
          counts = (submissions || []).reduce<Record<number, number>>((acc, row: any) => {
            acc[row.test_id] = (acc[row.test_id] || 0) + 1;
            return acc;
          }, {});
        }

        if (cancelled) return;

        const next: Record<EventTestType, DraftTest> = {
          Pre: emptyDraft('Pre'),
          Post: emptyDraft('Post'),
        };

        testRows.forEach(test => {
          const questions = questionRows
            .filter(question => question.test_id === test.test_id)
            .map<DraftQuestion>(question => ({
              question_id: question.question_id,
              question_text: question.question_text,
              // Pad back up to four rows so there is always an empty slot to type into.
              choices: CHOICE_KEYS.slice(0, Math.max(4, question.choices.length)).map(key => ({
                key,
                label: question.choices.find(choice => choice.key === key)?.label || '',
              })),
              correct_key: question.correct_key,
              points: Number(question.points),
            }));

          next[test.test_type] = {
            test_id: test.test_id,
            enabled: true,
            title: test.title,
            instructions: test.instructions || '',
            passingScore: test.passing_score === null || test.passing_score === undefined
              ? ''
              : String(test.passing_score),
            isOpen: test.is_open,
            showScore: test.show_score,
            questions: questions.length > 0 ? questions : [emptyQuestion()],
          };
        });

        setDrafts(next);
        setSubmissionCounts(counts);
      } catch (error: any) {
        console.error('Error loading event tests:', error);
        toast.error(error?.message || 'Unable to load the tests for this event.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [event.event_id]);

  // ── Links
  const baseUrl = useMemo(() => window.location.href.split('/events')[0], []);
  const testLink = useCallback(
    (testType: EventTestType) => buildEventTestLink(baseUrl, event.event_id, testType),
    [baseUrl, event.event_id]
  );

  const copyLink = (testType: EventTestType) => {
    navigator.clipboard.writeText(testLink(testType));
    setCopiedType(testType);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const downloadQr = async (testType: EventTestType) => {
    const svgElement = qrRefs.current[testType]?.querySelector('svg');
    if (!svgElement) {
      toast.error('Unable to generate QR code. Please try again.');
      return;
    }

    setDownloadingQr(true);
    try {
      await downloadQrCodePng(
        svgElement,
        `${qrFileSlug(event.event_name)}_${testType.toLowerCase()}_test_qr.png`
      );
      toast.success(`${EVENT_TEST_LABEL[testType]} QR code downloaded.`);
    } catch (error: any) {
      toast.error('Error generating QR code: ' + (error?.message || 'Unknown error'));
    } finally {
      setDownloadingQr(false);
    }
  };

  // ── Save
  const saveTest = async (testType: EventTestType) => {
    const current = drafts[testType];
    const submissionCount = current.test_id ? submissionCounts[current.test_id] || 0 : 0;

    // Removing a test cascades to its submissions, so it is only offered while
    // there are none. Closing the test is the non-destructive stop.
    if (!current.enabled) {
      if (!current.test_id) return;
      if (submissionCount > 0) {
        toast.error(
          `${EVENT_TEST_LABEL[testType]} has ${submissionCount} submission${submissionCount === 1 ? '' : 's'}. ` +
          'Close it instead of removing it.'
        );
        return;
      }
      const { error } = await supabase.from('event_tests').delete().eq('test_id', current.test_id);
      if (error) throw error;
      patchDraft(testType, { test_id: undefined, questions: [emptyQuestion()] });
      return;
    }

    const problem = validateDraftQuestions(current.questions);
    if (problem) {
      setActiveType(testType);
      throw new Error(`${EVENT_TEST_LABEL[testType]}: ${problem}`);
    }

    const parsedPassingScore = current.passingScore.trim() === ''
      ? null
      : Number(current.passingScore);
    if (parsedPassingScore !== null && (Number.isNaN(parsedPassingScore) || parsedPassingScore < 0 || parsedPassingScore > 100)) {
      setActiveType(testType);
      throw new Error(`${EVENT_TEST_LABEL[testType]}: passing score must be between 0 and 100.`);
    }

    const meta = {
      event_id: event.event_id,
      test_type: testType,
      title: current.title.trim() || DEFAULT_EVENT_TEST_TITLE[testType],
      instructions: current.instructions.trim() || null,
      passing_score: parsedPassingScore,
      is_open: current.isOpen,
      show_score: current.showScore,
    };

    let testId = current.test_id;
    if (testId) {
      const { error } = await supabase.from('event_tests').update(meta).eq('test_id', testId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('event_tests')
        .insert(meta)
        .select('test_id')
        .single();
      if (error) throw error;
      testId = data.test_id as number;
    }

    // Questions are reconciled rather than replaced: submissions store answers
    // keyed by question_id, so reusing ids keeps past results readable.
    const prepared = current.questions.map((question, index) => ({
      question_id: question.question_id,
      test_id: testId as number,
      position: index + 1,
      question_text: question.question_text.trim(),
      choices: question.choices
        .filter(choice => choice.label.trim())
        .map(choice => ({ key: choice.key, label: choice.label.trim() })),
      correct_key: question.correct_key,
      points: question.points,
    }));

    const keptIds = prepared.map(question => question.question_id).filter(Boolean) as number[];
    const { data: existingRows, error: existingError } = await supabase
      .from('event_test_questions')
      .select('question_id')
      .eq('test_id', testId);
    if (existingError) throw existingError;

    const removedIds = (existingRows || [])
      .map((row: any) => row.question_id as number)
      .filter(id => !keptIds.includes(id));

    // Positions are unique per test, so clear the removed rows before writing the
    // new numbering — otherwise a delete-after-update collides on (test_id, position).
    if (removedIds.length > 0) {
      const { error } = await supabase
        .from('event_test_questions')
        .delete()
        .in('question_id', removedIds);
      if (error) throw error;
    }

    for (const question of prepared) {
      if (question.question_id) {
        const { question_id, ...fields } = question;
        const { error } = await supabase
          .from('event_test_questions')
          .update(fields)
          .eq('question_id', question_id);
        if (error) throw error;
      } else {
        const { question_id, ...fields } = question;
        const { error } = await supabase.from('event_test_questions').insert(fields);
        if (error) throw error;
      }
    }

    patchDraft(testType, { test_id: testId });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const testType of EVENT_TEST_TYPES) {
        await saveTest(testType);
      }
      toast.success('Tests saved.');
      onSaved?.();
      onClose();
    } catch (error: any) {
      console.error('Error saving event tests:', error);
      toast.error(error?.message || 'Unable to save the tests.');
    } finally {
      setSaving(false);
    }
  };

  // ── Pulling the pre-test's questions into the post-test
  //
  // A copy, not a link: the post-test gets its own rows, so editing one test
  // afterwards never silently rewrites the other. Shuffling is applied once, here,
  // rather than per participant — everyone sits the same paper, which is what keeps
  // the per-question results in the report comparable between the two tests.

  const isAnsweredDraft = (question: DraftQuestion) =>
    Boolean(question.question_text.trim() || question.choices.some(choice => choice.label.trim()));

  const preQuestions = drafts.Pre.questions.filter(isAnsweredDraft);
  const canPullFromPre = activeType === 'Post' && drafts.Pre.enabled && preQuestions.length > 0;
  const postHasContent = drafts.Post.questions.some(isAnsweredDraft);

  const shuffled = <T,>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  /**
   * Reorders A/B/C/D within one question. Choice keys are positional, so the
   * labels move and the keys are handed out afresh — `correct_key` is re-pointed
   * at wherever the right answer landed rather than being carried along.
   * Blank slots stay at the bottom so there is still somewhere to type.
   */
  const shuffleChoices = (question: DraftQuestion): DraftQuestion => {
    const filled = question.choices
      .filter(choice => choice.label.trim())
      .map(choice => ({ label: choice.label, isCorrect: choice.key === question.correct_key }));
    if (filled.length < 2) return question;

    const reordered = shuffled(filled);
    const blankCount = question.choices.length - filled.length;
    const choices = [
      ...reordered.map((choice, index) => ({ key: CHOICE_KEYS[index], label: choice.label })),
      ...Array.from({ length: blankCount }, (_, i) => ({
        key: CHOICE_KEYS[reordered.length + i],
        label: '',
      })),
    ];
    const correctIndex = reordered.findIndex(choice => choice.isCorrect);

    return { ...question, choices, correct_key: CHOICE_KEYS[Math.max(0, correctIndex)] };
  };

  const pullFromPreTest = () => {
    // question_id is dropped so these save as new rows under the post-test.
    const copies: DraftQuestion[] = preQuestions.map(question => {
      const copy: DraftQuestion = {
        question_text: question.question_text,
        choices: question.choices.map(choice => ({ ...choice })),
        correct_key: question.correct_key,
        points: question.points,
      };
      return shuffleChoicesOnPull ? shuffleChoices(copy) : copy;
    });

    patchDraft('Post', { questions: shuffleOnPull ? shuffled(copies) : copies });
    setPulledFromPre(true);
    setConfirmingPull(false);

    const reordered = [
      shuffleOnPull ? 'question order' : null,
      shuffleChoicesOnPull ? 'choices' : null,
    ].filter(Boolean);
    toast.success(
      `Copied ${copies.length} question${copies.length === 1 ? '' : 's'} from the pre-test` +
      (reordered.length > 0 ? `, with a new ${reordered.join(' and ')}.` : '.')
    );
  };

  const shuffleQuestionOrder = () => {
    patchDraft('Post', { questions: shuffled(drafts.Post.questions) });
    toast.success('Question order shuffled.');
  };

  const shuffleAllChoices = () => {
    patchDraft('Post', { questions: drafts.Post.questions.map(shuffleChoices) });
    toast.success('Choices shuffled within each question.');
  };

  /** The "shuffle again" shortcut repeats whichever passes the checkboxes ask for. */
  const reshufflePost = () => {
    let questions = drafts.Post.questions;
    if (shuffleChoicesOnPull) questions = questions.map(shuffleChoices);
    if (shuffleOnPull) questions = shuffled(questions);
    patchDraft('Post', { questions });
    toast.success('Shuffled again.');
  };

  // ── Question list actions
  const addQuestion = () =>
    patchDraft(activeType, { questions: [...draft.questions, emptyQuestion()] });

  const removeQuestion = (index: number) =>
    patchDraft(activeType, {
      questions: draft.questions.length === 1
        ? [emptyQuestion()]
        : draft.questions.filter((_, i) => i !== index),
    });

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.questions.length) return;
    const questions = [...draft.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    patchDraft(activeType, { questions });
  };

  const addChoice = (index: number) => {
    const question = draft.questions[index];
    if (question.choices.length >= MAX_CHOICES) return;
    patchQuestion(index, {
      choices: [...question.choices, { key: CHOICE_KEYS[question.choices.length], label: '' }],
    });
  };

  const removeChoice = (questionIndex: number, choiceIndex: number) => {
    const question = draft.questions[questionIndex];
    if (question.choices.length <= MIN_CHOICES) return;
    // Keys are positional (a, b, c…), so dropping one renumbers the rest. The
    // correct answer follows the label it was pointing at.
    const correctLabelIndex = question.choices.findIndex(choice => choice.key === question.correct_key);
    const choices = question.choices
      .filter((_, i) => i !== choiceIndex)
      .map((choice, i) => ({ ...choice, key: CHOICE_KEYS[i] }));
    const nextCorrectIndex = correctLabelIndex === choiceIndex
      ? 0
      : correctLabelIndex > choiceIndex
        ? correctLabelIndex - 1
        : correctLabelIndex;
    patchQuestion(questionIndex, {
      choices,
      correct_key: CHOICE_KEYS[Math.max(0, Math.min(nextCorrectIndex, choices.length - 1))],
    });
  };

  const submissionCount = draft.test_id ? submissionCounts[draft.test_id] || 0 : 0;
  const totalPoints = draft.questions.reduce((sum, question) => sum + (question.points || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-card shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-800">Pre-test / Post-test</h3>
            <p className="truncate text-xs text-slate-500">{event.event_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={22} />
          </button>
        </div>

        {/* Test tabs */}
        <div className="flex gap-2 border-b border-slate-200 px-6 pt-3">
          {EVENT_TEST_TYPES.map(testType => (
            <button
              key={testType}
              onClick={() => { setActiveType(testType); setConfirmingPull(false); }}
              className={`relative -mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition-colors ${
                activeType === testType
                  ? 'border-slate-200 bg-card text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {EVENT_TEST_LABEL[testType]}
              {drafts[testType].enabled && (
                <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-mono text-emerald-600">
                  on
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-slate-400">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : (
          <div className="flex-1 space-y-6 overflow-y-auto p-6">

            {/* Enable */}
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border-2 border-slate-200 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  Run a {EVENT_TEST_LABEL[activeType].toLowerCase()} for this event
                </span>
                <span className="block text-xs text-slate-500">
                  Participants answer it from its own QR code, picking their name from this event's list.
                </span>
              </span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={e => patchDraft(activeType, { enabled: e.target.checked })}
                className="h-4 w-4 shrink-0 accent-indigo-600"
              />
            </label>

            {draft.enabled && (
              <>
                {submissionCount > 0 && (
                  <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {submissionCount} submission{submissionCount === 1 ? ' has' : 's have'} already been
                      recorded. Editing questions or answers here does not rescore them.
                    </span>
                  </div>
                )}

                {/* Meta */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Title</label>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={e => patchDraft(activeType, { title: e.target.value })}
                      placeholder={DEFAULT_EVENT_TEST_TITLE[activeType]}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Instructions <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <textarea
                      value={draft.instructions}
                      onChange={e => patchDraft(activeType, { instructions: e.target.value })}
                      rows={2}
                      placeholder="Shown above the questions."
                      className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Passing score % <span className="font-normal text-slate-400">(reporting only)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.passingScore}
                      onChange={e => patchDraft(activeType, { passingScore: e.target.value })}
                      placeholder="e.g. 75"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Marks pass/fail in the results report. A Certificate of Completion needs the test
                      taken, not passed.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <span>
                        <span className="block font-medium">Accepting answers</span>
                        <span className="block text-[11px] text-slate-400">Turn off to stop new submissions.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={draft.isOpen}
                        onChange={e => patchDraft(activeType, { isOpen: e.target.checked })}
                        className="h-4 w-4 shrink-0 accent-indigo-600"
                      />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <span>
                        <span className="block font-medium">Show score to participant</span>
                        <span className="block text-[11px] text-slate-400">On the thank-you screen.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={draft.showScore}
                        onChange={e => patchDraft(activeType, { showScore: e.target.checked })}
                        className="h-4 w-4 shrink-0 accent-indigo-600"
                      />
                    </label>
                  </div>
                </div>

                {/* QR — only once the test exists, so the link always resolves */}
                {draft.test_id ? (
                  <div className="flex flex-col items-center gap-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 sm:flex-row sm:items-start">
                    <div
                      ref={element => { qrRefs.current[activeType] = element; }}
                      className="rounded-lg border-2 border-indigo-100 bg-card p-3"
                    >
                      <div className="relative inline-block">
                        <QRCode value={testLink(activeType)} size={132} level="H" />
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card p-1">
                          <img src="/assets/dilg_logo.png" alt="DILG Logo" className="h-8 w-8 rounded-full object-contain" />
                        </div>
                      </div>
                    </div>

                    <div className="w-full min-w-0 flex-1 space-y-2">
                      <p className="text-xs font-semibold text-slate-600">
                        {EVENT_TEST_LABEL[activeType]} link
                      </p>
                      <div className="flex gap-2">
                        <input
                          readOnly
                          value={testLink(activeType)}
                          className="block w-full min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600 focus:outline-none"
                        />
                        <button
                          onClick={() => copyLink(activeType)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all ${
                            copiedType === activeType
                              ? 'border-green-200 bg-green-50 text-green-700'
                              : 'border-slate-300 bg-card text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {copiedType === activeType ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                      </div>
                      <button
                        onClick={() => downloadQr(activeType)}
                        disabled={downloadingQr}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {downloadingQr ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                        Download QR Code (PNG)
                      </button>
                      {!draft.isOpen && (
                        <p className="text-[11px] text-amber-600">
                          The test is closed — the QR resolves but answers are not accepted.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Save this test to get its QR code and link.
                  </p>
                )}

                {/* Pull from the pre-test */}
                {canPullFromPre && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                    <div className="flex items-start gap-2">
                      <CopyPlus size={15} className="mt-0.5 shrink-0 text-sky-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          Use the pre-test's questions
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Copies all {preQuestions.length} pre-test question
                          {preQuestions.length === 1 ? '' : 's'} here, answers included. They become the
                          post-test's own copies — editing one test later never changes the other.
                        </p>

                        <div className="mt-3 space-y-1.5">
                          <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={shuffleOnPull}
                              onChange={e => setShuffleOnPull(e.target.checked)}
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-sky-600"
                            />
                            Shuffle the question order, so the post-test isn't answered from memory
                          </label>
                          <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={shuffleChoicesOnPull}
                              onChange={e => setShuffleChoicesOnPull(e.target.checked)}
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-sky-600"
                            />
                            Shuffle the choices inside each question too — the right answer moves with
                            its text, so scoring stays correct
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {confirmingPull ? (
                            <>
                              <span className="text-xs font-medium text-amber-700">
                                Replace the {draft.questions.filter(isAnsweredDraft).length} question
                                {draft.questions.filter(isAnsweredDraft).length === 1 ? '' : 's'} already here?
                              </span>
                              <button
                                onClick={pullFromPreTest}
                                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-700"
                              >
                                Replace
                              </button>
                              <button
                                onClick={() => setConfirmingPull(false)}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => (postHasContent ? setConfirmingPull(true) : pullFromPreTest())}
                              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-700"
                            >
                              <CopyPlus size={13} />
                              Copy {preQuestions.length} question{preQuestions.length === 1 ? '' : 's'}
                            </button>
                          )}

                          {pulledFromPre && !confirmingPull && (
                            <button
                              onClick={reshufflePost}
                              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              <Shuffle size={13} /> Shuffle again
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Questions */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-800">
                      Questions
                      <span className="ml-2 font-mono text-xs font-normal text-slate-400">
                        {draft.questions.length} · {totalPoints} pt{totalPoints === 1 ? '' : 's'}
                      </span>
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      {activeType === 'Post' && draft.questions.length > 0 && (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-slate-400">Shuffle</span>
                          {draft.questions.length > 1 && (
                            <button
                              onClick={shuffleQuestionOrder}
                              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                              title="Put the questions in a random order"
                            >
                              <Shuffle size={13} /> Questions
                            </button>
                          )}
                          <button
                            onClick={shuffleAllChoices}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                            title="Reorder A/B/C/D within every question"
                          >
                            <Shuffle size={13} /> Choices
                          </button>
                        </span>
                      )}
                      <button
                        onClick={addQuestion}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <Plus size={14} /> Add question
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {draft.questions.map((question, questionIndex) => (
                      <div key={questionIndex} className="rounded-xl border border-slate-200 p-4">
                        <div className="mb-3 flex items-start gap-2">
                          <div className="mt-2 flex flex-col text-slate-300">
                            <button
                              onClick={() => moveQuestion(questionIndex, -1)}
                              disabled={questionIndex === 0}
                              className="hover:text-slate-500 disabled:opacity-30"
                              title="Move up"
                            >
                              <ChevronDown size={13} className="rotate-180" />
                            </button>
                            <GripVertical size={13} />
                            <button
                              onClick={() => moveQuestion(questionIndex, 1)}
                              disabled={questionIndex === draft.questions.length - 1}
                              className="hover:text-slate-500 disabled:opacity-30"
                              title="Move down"
                            >
                              <ChevronDown size={13} />
                            </button>
                          </div>

                          <span className="mt-2 w-6 shrink-0 font-mono text-sm text-slate-400">
                            {questionIndex + 1}.
                          </span>

                          <textarea
                            value={question.question_text}
                            onChange={e => patchQuestion(questionIndex, { question_text: e.target.value })}
                            rows={2}
                            placeholder="Question text"
                            className="min-w-0 flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />

                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <input
                              type="number"
                              min={0.5}
                              step={0.5}
                              value={question.points}
                              onChange={e => patchQuestion(questionIndex, { points: Number(e.target.value) })}
                              title="Points"
                              className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                            />
                            <button
                              onClick={() => removeQuestion(questionIndex)}
                              className="rounded p-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              title="Remove question"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <p className="mb-2 pl-8 text-[11px] font-medium text-slate-500">
                          Choices — select the correct answer
                        </p>
                        <div className="space-y-2 pl-8">
                          {question.choices.map((choice, choiceIndex) => (
                            <div key={choice.key} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-${activeType}-${questionIndex}`}
                                checked={question.correct_key === choice.key}
                                onChange={() => patchQuestion(questionIndex, { correct_key: choice.key })}
                                className="h-4 w-4 shrink-0 accent-emerald-600"
                                title="Correct answer"
                              />
                              <span className="w-5 shrink-0 font-mono text-xs text-slate-400">
                                {choiceLetter(choice.key)}
                              </span>
                              <input
                                type="text"
                                value={choice.label}
                                onChange={e => {
                                  const choices = question.choices.map((c, i) =>
                                    i === choiceIndex ? { ...c, label: e.target.value } : c
                                  );
                                  patchQuestion(questionIndex, { choices });
                                }}
                                placeholder={`Choice ${choiceLetter(choice.key)}`}
                                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                              <button
                                onClick={() => removeChoice(questionIndex, choiceIndex)}
                                disabled={question.choices.length <= MIN_CHOICES}
                                className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 disabled:opacity-30"
                                title="Remove choice"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          {question.choices.length < MAX_CHOICES && (
                            <button
                              onClick={() => addChoice(questionIndex)}
                              className="text-xs font-medium text-indigo-600 hover:underline"
                            >
                              + Add choice
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!draft.enabled && draft.test_id && (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Saving now removes this {EVENT_TEST_LABEL[activeType].toLowerCase()} and its questions.
                  {(submissionCounts[draft.test_id] || 0) > 0
                    ? ' It has submissions, so removal will be refused — turn off “Accepting answers” instead.'
                    : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <p className="text-xs text-slate-400">
            A Certificate of Completion requires every enabled test to be submitted.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventTestBuilder;
