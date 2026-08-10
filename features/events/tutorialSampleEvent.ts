import { addDays, format } from 'date-fns';
import { Event, EventAccessRole, GiveawayItem } from '../../types/database';
import { DraftQuestion } from '../../lib/eventTests';

/**
 * The stand-in event every run of the Events walkthrough demonstrates on — the QR dialog,
 * the test builder, access settings and a populated participant list all open against this
 * rather than one of the office's own events.
 *
 * Always, not just for an empty list. It makes the tour identical for every office, and it
 * means the steps that open editors can never reach a real record: an office with a
 * hundred events sees exactly what a brand-new one sees.
 *
 * Nothing here is written to or read from the database. The card is prepended to the list
 * only while the tutorial is open, and the tutorial overlay blocks every click underneath
 * it, so the sample can never be edited, shared, deleted or saved. Its id is negative,
 * which no generated identity column ever produces, so a stray query built from it cannot
 * collide with a real row either — and the two handlers that would insert rows refuse it
 * outright rather than relying on that.
 */

export const SAMPLE_EVENT_ID = -1;

export const isSampleEvent = (eventId?: number | null) =>
  typeof eventId === 'number' && eventId === SAMPLE_EVENT_ID;

const SAMPLE_GIVEAWAYS: GiveawayItem[] = [
  {
    key: 'sample_shirt',
    label: 'Event T-shirt',
    type: 'single-select',
    options: ['S', 'M', 'L', 'XL', '2XL'],
    required: true,
    include_in_attendance: true,
  },
];

/**
 * Dated around today so the card carries an "Ongoing" badge and the participant list
 * reads like a live event. `organize_by` is the viewer's own office, which is what makes
 * the Access button appear for an Office Manager.
 */
export const buildSampleEvent = (officeId?: number | null): Event => {
  const today = new Date();
  return {
    event_id: SAMPLE_EVENT_ID,
    event_name: 'Sample: Training on Crisis Management for LGUs (Batch 1)',
    venue: 'Apple Tree Resort and Hotel, Taboc, Opol, Misamis Oriental',
    start_date: format(today, 'yyyy-MM-dd'),
    end_date: format(addDays(today, 1), 'yyyy-MM-dd'),
    event_serial: 'SMPL',
    status: 'Ongoing',
    organize_by: officeId ?? null,
    has_accommodation: true,
    registration_open: true,
    auto_attendance_on_registration: false,
    session: 'All_Day',
    days_accommodation: 1,
    dates_with_accom: [format(today, 'yyyy-MM-dd')],
    food_inclusion: null,
    giveaways: SAMPLE_GIVEAWAYS,
    giveaways_open: true,
    has_principal_delegates: false,
    deleted_at: null,
  };
};

// ─── Participant list ─────────────────────────────────────────────────────────

type SamplePerson = {
  f_name: string;
  l_name: string;
  role: string;
  position: string;
  office: string;
  gender: string;
  needs_accommodation?: boolean;
  accept_photo_video?: boolean;
};

const SAMPLE_PEOPLE: SamplePerson[] = [
  { f_name: 'Maria', l_name: 'Santos', role: 'Speaker', position: 'Regional Director', office: 'DILG Region X', gender: 'Female' },
  { f_name: 'Antonio', l_name: 'Reyes', role: 'Secretariat', position: 'Administrative Officer', office: 'DILG Region X', gender: 'Male' },
  { f_name: 'Jocelyn', l_name: 'Bautista', role: 'Delegate', position: 'MLGOO', office: 'Opol, Misamis Oriental', gender: 'Female', needs_accommodation: true },
  { f_name: 'Ferdinand', l_name: 'Aquino', role: 'Delegate', position: 'Municipal Administrator', office: 'El Salvador City', gender: 'Male', needs_accommodation: true },
  { f_name: 'Grace', l_name: 'Villanueva', role: 'Delegate', position: 'LDRRMO', office: 'Alubijid, Misamis Oriental', gender: 'Female', accept_photo_video: false },
];

/**
 * Shaped like a `fetchEventParticipants` result so the participant view renders it with
 * no special cases — the same table, chips, filters and counts as a real event.
 */
export const buildSampleParticipants = () => {
  const registeredAt = new Date();

  return SAMPLE_PEOPLE.map((person, index) => {
    // Stagger the registration times so the "Registered" column reads naturally.
    const stamp = new Date(registeredAt.getTime() - (SAMPLE_PEOPLE.length - index) * 37 * 60000);

    return {
      id: -(index + 1),
      participant_id: -(index + 1),
      registration_status: 'Registered',
      registered_at: stamp.toISOString(),
      role: person.role,
      delegate_type: null,
      needs_accommodation: person.needs_accommodation ?? false,
      accommodation_pax: person.needs_accommodation ? 1 : 0,
      accept_photo_video: person.accept_photo_video ?? true,
      store_to_db: true,
      need_ca: true,
      date_accommodation: null,
      giveaway_selections: { sample_shirt: ['S', 'M', 'L', 'XL', '2XL'][index % 5] },
      participants: {
        participant_id: -(index + 1),
        participant_code: `SMPL-${String(index + 1).padStart(4, '0')}`,
        full_name: `${person.f_name} ${person.l_name}`,
        f_name: person.f_name,
        l_name: person.l_name,
        m_initial: null,
        suffix: null,
        gender: person.gender,
        position: person.position,
        office: person.office,
        email: null,
        age_group: null,
        pwd: null,
        indigenous_people: null,
        mobile_no: null,
        location_id: null,
      },
    };
  });
};

// ─── Access list ──────────────────────────────────────────────────────────────

type SampleAssignee = { full_name: string; username: string; office: string; access_role: EventAccessRole };

const SAMPLE_ASSIGNEES: SampleAssignee[] = [
  { full_name: 'Rosalinda Cruz', username: 'rcruz', office: 'CDO', access_role: 'ManagerScanner' },
  { full_name: 'Miguel Fernandez', username: 'mfernandez', office: 'MISOR', access_role: 'Scanner' },
];

/** Shaped like a `fetchEventAccess` result, so the Assigned Users panel is not empty. */
export const buildSampleAccessList = () =>
  SAMPLE_ASSIGNEES.map((assignee, index) => ({
    id: -(index + 1),
    event_id: SAMPLE_EVENT_ID,
    user_id: -(index + 1),
    access_role: assignee.access_role,
    assigned_by: null,
    assigned_at: new Date().toISOString(),
    status: 'Active' as const,
    users: {
      user_id: -(index + 1),
      full_name: assignee.full_name,
      username: assignee.username,
      office_id: null,
      status: 'Active' as const,
      offices: { code: assignee.office, name: assignee.office },
    },
  }));

// ─── Pre-test / post-test ─────────────────────────────────────────────────────

const question = (text: string, choices: string[], correctIndex: number): DraftQuestion => ({
  question_text: text,
  choices: choices.map((label, i) => ({ key: 'abcdef'[i], label })),
  correct_key: 'abcdef'[correctIndex],
  points: 1,
});

/**
 * Two worked questions so the builder shows a filled-in test rather than one blank row —
 * the correct-answer radio, the points box and the reorder arrows all have something to
 * point at.
 */
export const buildSampleTestQuestions = (): DraftQuestion[] => [
  question(
    'Which body has primary responsibility for disaster preparedness at the municipal level?',
    ['The Sangguniang Bayan', 'The Local Disaster Risk Reduction and Management Council', 'The Provincial Governor', 'The Regional Office'],
    1
  ),
  question(
    'Under RA 10121, what share of the local calamity fund is set aside as Quick Response Fund?',
    ['10%', '30%', '50%', '70%'],
    1
  ),
];

/** Stands in for a saved `event_tests` row, so the builder shows its QR block. */
export const SAMPLE_PRE_TEST_ID = -1;

export const SAMPLE_TEST_META = {
  instructions: 'Answer all questions. Pick your name from the list before you begin.',
  passingScore: '75',
};
