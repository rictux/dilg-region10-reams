import { EventTest, EventTestSubmission, EventTestType } from '../types/database';

// Pre-test / Post-test helpers.
//
// A test exists for an event only when an `event_tests` row is present, so "does
// this event have a post-test?" is always a question about the rows you fetched,
// never about a flag on the event. Everything here assumes that.

export const EVENT_TEST_TYPES: EventTestType[] = ['Pre', 'Post'];

export const EVENT_TEST_LABEL: Record<EventTestType, string> = {
  Pre: 'Pre-test',
  Post: 'Post-test',
};

const EVENT_TEST_SLUG: Record<EventTestType, string> = {
  Pre: 'pre',
  Post: 'post',
};

export const DEFAULT_EVENT_TEST_TITLE: Record<EventTestType, string> = {
  Pre: 'Pre-test',
  Post: 'Post-test',
};

/** Choice keys are assigned by position, so a question's options read A, B, C, D. */
export const CHOICE_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

export const MIN_CHOICES = 2;
export const MAX_CHOICES = CHOICE_KEYS.length;

export const choiceLetter = (key: string) => key.toUpperCase();

/**
 * `/test/:eventId/:testType`. Takes the base URL rather than reading
 * window.location so it matches getRegistrationLink, which is careful to work
 * when the app is served under a sub-path.
 */
export const buildEventTestLink = (
  baseUrl: string,
  eventId: number,
  testType: EventTestType
) => `${baseUrl.replace(/\/+$/, '')}/test/${eventId}/${EVENT_TEST_SLUG[testType]}`;

/** Reads the `:testType` route segment. Anything else is a 404 for the page. */
export const parseEventTestSlug = (slug?: string | null): EventTestType | null => {
  const normalized = (slug || '').trim().toLowerCase();
  if (normalized === 'pre') return 'Pre';
  if (normalized === 'post') return 'Post';
  return null;
};

export const scorePercent = (score: number, maxScore: number): number | null =>
  maxScore > 0 ? (score / maxScore) * 100 : null;

export const formatScorePercent = (score: number, maxScore: number): string => {
  const percent = scorePercent(score, maxScore);
  return percent === null ? '—' : `${Math.round(percent)}%`;
};

/**
 * Passing is a reporting benchmark only — it never decides who may receive a
 * certificate. A test with no passing_score has no notion of failing.
 */
export const isPassingSubmission = (
  test: Pick<EventTest, 'passing_score'> | null | undefined,
  submission: Pick<EventTestSubmission, 'score' | 'max_score'>
): boolean | null => {
  const threshold = test?.passing_score;
  if (threshold === null || threshold === undefined) return null;
  const percent = scorePercent(submission.score, submission.max_score);
  return percent === null ? null : percent >= Number(threshold);
};

// ─── Certificate of Completion eligibility ───────────────────────────────────

export type TestRequirementStatus = {
  /** Tests the participant has not submitted. Empty means the requirement is met. */
  missing: EventTestType[];
  met: boolean;
};

/** participant_id → the set of test_ids they have submitted. */
export const buildTestCompletionIndex = (
  submissions: Pick<EventTestSubmission, 'participant_id' | 'test_id'>[]
): Map<number, Set<number>> => {
  const index = new Map<number, Set<number>>();
  submissions.forEach(submission => {
    if (!index.has(submission.participant_id)) {
      index.set(submission.participant_id, new Set());
    }
    index.get(submission.participant_id)!.add(submission.test_id);
  });
  return index;
};

/**
 * A Certificate of Completion asks that every test the event enabled was taken —
 * the score is irrelevant. An event with no tests configured has nothing to miss,
 * so the requirement is met vacuously and behavior is unchanged.
 */
export const evaluateTestRequirement = (
  tests: Pick<EventTest, 'test_id' | 'test_type'>[],
  completion: Map<number, Set<number>>,
  participantId: number
): TestRequirementStatus => {
  const submitted = completion.get(participantId);
  const missing = tests
    .filter(test => !submitted?.has(test.test_id))
    .map(test => test.test_type);

  return { missing, met: missing.length === 0 };
};

/** Chip text for a participant who cannot receive a Certificate of Completion. */
export const missingTestsLabel = (missing: EventTestType[]): string => {
  if (missing.length === 0) return '';
  if (missing.length === 1) return `No ${EVENT_TEST_LABEL[missing[0]].toLowerCase()}`;
  return 'No pre or post-test';
};

// ─── Builder validation ──────────────────────────────────────────────────────

export type DraftQuestion = {
  /** Present for questions already saved; absent for ones added in this session. */
  question_id?: number;
  question_text: string;
  choices: { key: string; label: string }[];
  correct_key: string;
  points: number;
};

/**
 * Returns the first problem that would make a test unusable, or null when the
 * draft is safe to save. Order matters: the message points at the earliest
 * question with a problem so the operator fixes them top to bottom.
 */
export const validateDraftQuestions = (questions: DraftQuestion[]): string | null => {
  if (questions.length === 0) return 'Add at least one question.';

  for (let index = 0; index < questions.length; index++) {
    const question = questions[index];
    const label = `Question ${index + 1}`;

    if (!question.question_text.trim()) return `${label} needs question text.`;

    const filled = question.choices.filter(choice => choice.label.trim());
    if (filled.length < MIN_CHOICES) return `${label} needs at least ${MIN_CHOICES} choices.`;

    if (!filled.some(choice => choice.key === question.correct_key)) {
      return `${label} needs a correct answer selected.`;
    }

    if (!(question.points > 0)) return `${label} needs points greater than zero.`;
  }

  return null;
};
