import React from 'react';
import { GraduationCap } from 'lucide-react';
import type { TourStep } from '../../components/GuidedTour';

/**
 * The walkthrough for the Events page. It covers the five things an organiser does to an
 * event, in the order they normally do them: create it, attach the pre-test and post-test,
 * hand access to the people who will run it, work the participant list, then share the
 * registration QR code.
 *
 * Most of what the page can do lives behind a modal, so each step names the *stage* it
 * needs and the page puts itself there — the setting is explained while it is on screen.
 */

/** The screen a step needs the Events page to be showing. */
export type EventsTourStage =
  | 'list'
  | 'create'
  | 'tests'
  | 'access'
  | 'participants'
  | 'share';

type StepFactoryOptions = {
  /** Puts the page on the screen the step describes. Called once per step entry. */
  showStage: (stage: EventsTourStage) => void;
  /** Mirrors the card's Tests / Edit buttons. */
  canEditEvents: boolean;
  /** Mirrors the card's Access button. */
  canSetAccess: boolean;
  /** Mirrors the Add Participant button in the event's participant view. */
  canManageParticipants: boolean;
};

const PART_CREATE = 'Part 1 · Create the event';
const PART_SHARE = 'Part 2 · Share the QR code';
const PART_TESTS = 'Part 3 · Pre-test & post-test';
const PART_ACCESS = 'Part 4 · Who can run it';
const PART_PEOPLE = 'Part 5 · The participant list';

export const buildEventsTourSteps = ({
  showStage,
  canEditEvents,
  canSetAccess,
  canManageParticipants,
}: StepFactoryOptions): TourStep[] => {
  const toList = () => showStage('list');

  const steps: TourStep[] = [
    {
      id: 'welcome',
      title: 'Running an event, end to end',
      placement: 'center',
      onEnter: toList,
      body: (
        <>
          <p className="mb-2">
            Five parts, in the order you normally do them: <strong>create the event</strong>,{' '}
            <strong>share its QR code</strong> to collect registrations, add a{' '}
            <strong>pre-test and post-test</strong>, <strong>give access</strong> to whoever will run
            it, then work the <strong>participant list</strong> on the day.
          </p>
          <p className="mb-2">
            <strong>Next</strong> / <strong>Back</strong> (or the ← → keys) move through it,{' '}
            <strong>Esc</strong> leaves. Screens open as you go — nothing is saved unless you press a
            save button yourself. Reopen this from the <strong>Tutorial</strong> button any time.
          </p>
          <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-800">
            Everything is demonstrated on a <strong>Sample</strong> event — the violet-tagged card
            at the top of the list, with made-up participants and a made-up test. It is display
            only: nothing about it is in the database, your own events are never opened or changed
            by this tour, and the card disappears the moment you close it.
          </p>
        </>
      ),
    },

    // ── Part 1 · Create ──────────────────────────────────────────────────────
    {
      id: 'new-event',
      section: PART_CREATE,
      title: 'Start from New Event',
      target: 'events-new-button',
      placement: 'bottom',
      onEnter: toList,
      body: (
        <p>
          Everything else on this page hangs off an event, so this is always the first move. The
          form opens as a drawer on the right; the next few steps walk down it. Editing an existing
          event later opens the very same form through the <strong>Edit</strong> button on its card.
        </p>
      ),
    },
    {
      id: 'form-basics',
      section: PART_CREATE,
      title: 'Name, office and event code',
      target: 'events-form-basics',
      placement: 'left',
      onEnter: () => showStage('create'),
      body: (
        <>
          <p className="mb-2">
            <strong>Event Name</strong> and <strong>Venue</strong> are required — the venue field
            suggests places already used before, so spelling stays consistent across events.
          </p>
          <p>
            <strong>Organized By</strong> is the owning office (Admins pick it; everyone else gets
            their own). It decides who can edit the event and who may hand out access later. The{' '}
            <strong>Event Code</strong> is the short prefix that goes into every participant's
            reference number — the <strong>i</strong> icon shows a worked example.
          </p>
        </>
      ),
    },
    {
      id: 'form-schedule',
      section: PART_CREATE,
      title: 'Set the dates first',
      target: 'events-form-schedule',
      placement: 'left',
      onEnter: () => showStage('create'),
      body: (
        <p>
          <strong>Start</strong> and <strong>End Date</strong> generate one row per day for the
          accommodation and meal options further down, so fill them in before those sections —
          changing the range afterwards rebuilds both. <strong>Event Session</strong> (AM, PM or All
          Day) is what attendance is logged against.
        </p>
      ),
    },
    {
      id: 'form-accommodation',
      section: PART_CREATE,
      title: 'Accommodation and meals',
      target: 'events-form-accommodation',
      placement: 'left',
      onEnter: () => showStage('create'),
      body: (
        <>
          <p className="mb-2">
            Turn on <strong>Include accommodation</strong> and tick only the nights that are
            covered. Participants are then asked at registration whether they need a room, and the
            list can be filtered by who does.
          </p>
          <p>
            Under <strong>Meals Included</strong>, tick the meals provided. They apply to every day
            unless you choose <strong>Customize per day</strong> — use that when, say, day one has
            no breakfast.
          </p>
        </>
      ),
    },
    {
      id: 'form-giveaways',
      section: PART_CREATE,
      title: 'Giveaways (optional)',
      target: 'events-form-giveaways',
      placement: 'left',
      onEnter: () => showStage('create'),
      body: (
        <p>
          Each item becomes a question on the registration form — a{' '}
          <strong>Choose an option</strong> item for things like a T-shirt size, or{' '}
          <strong>Yes / No</strong> for a simple opt-in. Tick{' '}
          <strong>Add to attendance sheet</strong> to print the answer beside the person's name when
          the item is handed out. Closing <strong>giveaway selection</strong> later stops new
          registrants choosing without touching the answers already given.
        </p>
      ),
    },
    {
      id: 'form-registration',
      section: PART_CREATE,
      title: 'Registration switches',
      target: 'events-form-registration',
      placement: 'left',
      onEnter: () => showStage('create'),
      body: (
        <>
          <p className="mb-2">
            <strong>Registration Status</strong> is the important one: the shared QR code only
            accepts sign-ups while it is <strong>Open</strong>. Close it to stop registration
            without deleting anything.
          </p>
          <p>
            <strong>Auto attendance on registration</strong> logs an arrival for anyone who
            registers on an event day — right for walk-in sign-ups at the door, wrong when people
            register days ahead. <strong>Principal / Representative delegates</strong> lets an
            invited official send someone in their place, and announces principals to your office
            as their QR is scanned.
          </p>
        </>
      ),
    },
    {
      id: 'form-save',
      section: PART_CREATE,
      title: 'Create the event',
      target: 'events-form-save',
      placement: 'top',
      onEnter: () => showStage('create'),
      body: (
        <p>
          Saving adds the event to the list with a status derived from its dates —{' '}
          <strong>Upcoming</strong>, <strong>Ongoing</strong> or <strong>Completed</strong>. Nothing
          here is final: every field can be changed later from the card's <strong>Edit</strong>{' '}
          button.
        </p>
      ),
    },
  ];

  // Everything below acts on the sample card the page prepends for the tour's benefit, so
  // these steps behave identically whether the office has no events or a hundred.

  // ── Part 2 · Share ─────────────────────────────────────────────────────────
  steps.push(
    {
      id: 'card-share',
      section: PART_SHARE,
      title: 'Open Share on the event card',
      target: 'events-card-share',
      placement: 'top',
      onEnter: toList,
      body: (
        <p>
          With the event created, this is how people get into it: the QR code they scan to register
          themselves. It works for anyone holding the link — no account needed — and every scan
          lands in the event's participant list, which Part 5 covers.
        </p>
      ),
    },
    {
      id: 'share-qr',
      section: PART_SHARE,
      title: 'The registration QR code',
      target: 'events-share-qr',
      placement: 'right',
      onEnter: () => showStage('share'),
      body: (
        <p>
          Project it, print it, or put it on the invitation. If the dialog shows{' '}
          <strong>Registration is Closed</strong> instead of a code, reopen{' '}
          <strong>Edit</strong> on the card and set <strong>Registration Status</strong> back to{' '}
          <strong>Open</strong> — a closed event cannot be registered for even with the link.
        </p>
      ),
    },
    {
      id: 'share-link',
      section: PART_SHARE,
      title: 'Copy the link',
      target: 'events-share-link',
      placement: 'top',
      onEnter: () => showStage('share'),
      body: (
        <p>
          The same registration form as the QR code, as a URL — the one to paste into a Viber group,
          an email or a memo, where a picture of a QR code is awkward to scan.
        </p>
      ),
    },
    {
      id: 'share-downloads',
      section: PART_SHARE,
      title: 'Download it',
      target: 'events-share-downloads',
      placement: 'top',
      onEnter: () => showStage('share'),
      body: (
        <p>
          <strong>Download Badge (PDF)</strong> gives a laid-out A4 sheet — event name, the code
          under a <em>Scan to register</em> caption, and the link printed underneath. That is the
          one to put on a stand at the entrance. <strong>Download QR Code (PNG)</strong> gives the
          bare image instead, for slides, posters and chat groups.
        </p>
      ),
    }
  );

  // ── Part 3 · Tests ─────────────────────────────────────────────────────────
  if (canEditEvents) {
    steps.push(
      {
        id: 'card-tests',
        section: PART_TESTS,
        title: 'Open Tests on the event card',
        target: 'events-card-tests',
        placement: 'top',
        onEnter: toList,
        body: (
          <p>
            One dialog holds both the <strong>pre-test</strong> and the{' '}
            <strong>post-test</strong> for this event. Each is optional, and each gets its own QR
            code — separate from the registration one you just shared. Participants answer by
            picking their name from this event's list, so there is nothing to log in to.
          </p>
        ),
      },
      {
        id: 'test-tabs',
        section: PART_TESTS,
        title: 'Pre-test and post-test tabs',
        target: 'test-tabs',
        placement: 'bottom',
        onEnter: () => showStage('tests'),
        body: (
          <p>
            The two tabs are wholly separate tests — an <strong>on</strong> badge marks the ones in
            use. Build the pre-test first: on the post-test tab you can then copy every pre-test
            question across in one click, optionally shuffling the questions and their choices so
            it is not answered from memory. The copies are independent, so editing one test never
            touches the other.
          </p>
        ),
      },
      {
        id: 'test-enable',
        section: PART_TESTS,
        title: 'Turn the test on',
        target: 'test-enable',
        placement: 'bottom',
        onEnter: () => showStage('tests'),
        body: (
          <p>
            Nothing else appears until this is ticked. Unticking it and saving{' '}
            <strong>deletes</strong> the test and its questions — which is refused once submissions
            exist, so to stop a running test turn off <strong>Accepting answers</strong> instead.
          </p>
        ),
      },
      {
        id: 'test-meta',
        section: PART_TESTS,
        title: 'Title, instructions and scoring',
        target: 'test-meta',
        placement: 'bottom',
        onEnter: () => showStage('tests'),
        body: (
          <>
            <p className="mb-2">
              <strong>Title</strong> and <strong>Instructions</strong> are what the participant sees
              above the questions. <strong>Passing score %</strong> only marks pass or fail in the
              results report — a Certificate of Completion needs the test taken, not passed.
            </p>
            <p>
              <strong>Accepting answers</strong> is the on/off switch for submissions;{' '}
              <strong>Show score to participant</strong> reveals the result on their thank-you
              screen, which you may want off for the pre-test.
            </p>
          </>
        ),
      },
      {
        id: 'test-questions',
        section: PART_TESTS,
        title: 'Write the questions',
        target: 'test-questions',
        placement: 'top',
        onEnter: () => showStage('tests'),
        body: (
          <p>
            <strong>Add question</strong> appends a multiple-choice item. Type the question, fill in
            the choices, and mark the correct one with the radio button on its left — that is what
            scoring reads. The small number box on the right is the question's{' '}
            <strong>points</strong>, and the arrows beside it reorder the list. Editing questions
            after people have answered does <em>not</em> rescore existing submissions.
          </p>
        ),
      },
      {
        id: 'test-qr',
        section: PART_TESTS,
        title: 'The test QR code',
        target: 'test-qr',
        placement: 'top',
        onEnter: () => showStage('tests'),
        body: (
          <p>
            This appears once the test has been saved at least once. Copy the link or download the
            PNG to put on a slide at the start and end of the session. Each test has its own QR —
            do not reuse the registration one. A closed test still resolves, but refuses answers.
          </p>
        ),
      },
      {
        id: 'test-save',
        section: PART_TESTS,
        title: 'Save the test',
        target: 'test-save',
        placement: 'top',
        onEnter: () => showStage('tests'),
        body: (
          <p>
            Saving writes whichever tab you are on <em>and</em> the other one, so build both before
            you leave. Come back through the same <strong>Tests</strong> button to adjust the
            wording, close the test, or fetch the QR again.
          </p>
        ),
      }
    );
  }

  // ── Part 4 · Access ────────────────────────────────────────────────────────
  if (canSetAccess) {
    steps.push(
      {
        id: 'card-access',
        section: PART_ACCESS,
        title: 'Open Access on the event card',
        target: 'events-card-access',
        placement: 'top',
        onEnter: toList,
        body: (
          <p>
            By default an event is visible to its owning office. Access settings let you name
            individual users — typically staff from another office who are helping run this one
            event — without changing their account role. Only Admins and the owning office's
            manager see this button.
          </p>
        ),
      },
      {
        id: 'access-assign',
        section: PART_ACCESS,
        title: 'Assign a user and a role',
        target: 'access-assign',
        placement: 'bottom',
        onEnter: () => showStage('access'),
        body: (
          <>
            <p className="mb-2">
              Pick the person from the dropdown — it searches by name, username and office, and
              hides anyone already assigned. Then choose what they may do:
            </p>
            <p className="mb-2">
              <strong>Manager + Scanner</strong> — the full run of the event.<br />
              <strong>Manager only</strong> — the event appears on their Events, Participants and
              Reports pages, but they cannot scan it.<br />
              <strong>Scanner only</strong> — the event appears in the QR scanner and nowhere else,
              which is what a door marshal needs.
            </p>
            <p>
              <strong>Assign</strong> grants it immediately — no sign-out and back in.
            </p>
          </>
        ),
      },
      {
        id: 'access-list',
        section: PART_ACCESS,
        title: 'Change or revoke access',
        target: 'access-list',
        placement: 'top',
        onEnter: () => showStage('access'),
        body: (
          <p>
            Everyone assigned is listed with their office and role. <strong>Edit</strong> switches a
            role — handy when a scanner is asked to cover the registration desk — and{' '}
            <strong>Revoke</strong> withdraws access. Revoking removes the event from their list; it
            never touches the attendance they already recorded.
          </p>
        ),
      }
    );
  }

  // ── Part 5 · Participants ──────────────────────────────────────────────────
  steps.push(
    {
      id: 'card-open',
      section: PART_PEOPLE,
      title: 'Click the card to open the event',
      target: 'events-card',
      placement: 'right',
      onEnter: toList,
      body: (
        <p>
          Clicking anywhere on a card — outside its buttons — opens that event's participant list.
          It replaces this page rather than opening a dialog, and <strong>Back</strong> at the top
          returns here. The list updates by itself as people register or are scanned in, so it can
          be left open at the registration desk.
        </p>
      ),
    },
    {
      id: 'participants-summary',
      section: PART_PEOPLE,
      title: 'Who is registered',
      target: 'participants-summary',
      placement: 'bottom',
      onEnter: () => showStage('participants'),
      body: (
        <p>
          The header counts the total and breaks it down by role —{' '}
          <strong>Delegate</strong>, <strong>Secretariat</strong>, <strong>Speaker</strong> and{' '}
          <strong>Guest/VIP</strong>. Below, the table is split the same way: the non-delegates
          first, then the delegates.
        </p>
      ),
    },
    {
      id: 'participants-filters',
      section: PART_PEOPLE,
      title: 'Filter and search',
      target: 'participants-filters',
      placement: 'bottom',
      onEnter: () => showStage('participants'),
      body: (
        <>
          <p className="mb-2">
            The tabs narrow the list to the groups you actually have to act on:{' '}
            <strong>Accommodation</strong> (shown when the event has rooms) for the hotel headcount,{' '}
            <strong>No Photo/Video</strong> and <strong>No Data Storage</strong> for the people
            whose consent you must respect, and <strong>Principal</strong> /{' '}
            <strong>Representative</strong> when the event uses delegate substitution.
          </p>
          <p>
            The search box matches name, position and office, and stacks on top of whichever tab is
            active.
          </p>
        </>
      ),
    },
    {
      id: 'participants-actions',
      section: PART_PEOPLE,
      title: 'Export, and add people yourself',
      target: 'participants-actions',
      placement: 'bottom',
      onEnter: () => showStage('participants'),
      body: (
        <>
          <p className="mb-2">
            <strong>Export</strong> downloads an Excel workbook of{' '}
            <em>every</em> registered participant — the tabs and the search box only narrow what is
            on screen, never what is exported. Columns for accommodation, delegate type and each
            giveaway appear only when the event uses them.
          </p>
          {canManageParticipants ? (
            <p>
              <strong>Add Participant</strong> registers someone by hand, for walk-ins and for
              speakers or secretariat who never scan the public QR. Typing a name suggests people
              already in the system so their record is reused rather than duplicated, and you can
              log their attendance and email their QR in the same step.
            </p>
          ) : (
            <p>
              Adding and editing participants needs the participant-management permission, which
              this account does not have — the button is hidden.
            </p>
          )}
        </>
      ),
    },
    {
      id: 'participants-table',
      section: PART_PEOPLE,
      title: 'Working the list',
      target: 'participants-table',
      placement: 'top',
      onEnter: () => showStage('participants'),
      body: (
        <p>
          Each row shows the person's role, position, office and when they registered, with a badge
          for anyone needing accommodation. The small <strong>pencil</strong> beside the role
          corrects it in place — that is the one to reach for when a delegate turns out to be a
          speaker. The actions on the right open the full record for editing, or remove someone
          registered by mistake. Attendance sheets, badges, certificates and reports all read from
          this list, so a fix here carries into every one of them.
        </p>
      ),
    }
  );

  steps.push({
    id: 'finish',
    title: "That's the whole loop",
    placement: 'center',
    onEnter: toList,
    body: (
      <>
        <p className="mb-2">
          <strong>New Event</strong> → <strong>Share</strong> the QR to collect registrations →{' '}
          <strong>Tests</strong> for the pre-test and post-test → <strong>Access</strong> for the
          people running it → open the card to work the <strong>participant list</strong> on the
          day.
        </p>
        <p>
          Reopen this walkthrough any time from the <strong>Tutorial</strong> button above the
          list.
        </p>
      </>
    ),
  });

  return steps;
};

// ─── Header trigger ───────────────────────────────────────────────────────────

export const EventsTutorialButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    data-tour="events-tutorial-button"
    onClick={onClick}
    title="Replay the step-by-step tutorial"
    className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[rgb(var(--ink)/0.10)] px-3 text-sm font-medium text-slate-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
  >
    <GraduationCap size={15} />
    <span className="hidden sm:inline">Tutorial</span>
  </button>
);
