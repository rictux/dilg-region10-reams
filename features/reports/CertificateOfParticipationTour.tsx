import React from 'react';
import { GraduationCap } from 'lucide-react';
import { GuidedTour, type TourStep } from '../../components/GuidedTour';

// The spotlight overlay itself is shared with the other in-app walkthroughs; this file
// only owns the script it plays.
export { GuidedTour };
export type { TourPlacement, TourStep } from '../../components/GuidedTour';

// ─── Step script ──────────────────────────────────────────────────────────────

type StepFactoryOptions = {
  openSettings: () => void;
  closeSettings: () => void;
};

/**
 * Walks the operator through one full run: configure the certificate, narrow the list
 * down to the right people, then hand the certificates out.
 */
export const buildCoPTourSteps = ({ openSettings, closeSettings }: StepFactoryOptions): TourStep[] => [
  {
    id: 'welcome',
    title: 'Generate Certificates of Participation',
    placement: 'center',
    onEnter: closeSettings,
    body: (
      <>
        <p className="mb-2">
          This walkthrough covers the full run in four parts: <strong>set up the certificate</strong>,{' '}
          <strong>filter the participants</strong>, <strong>check the preview</strong>, then{' '}
          <strong>email, print or export</strong>.
        </p>
        <p>
          Use <strong>Next</strong> / <strong>Back</strong> (or the ← → arrow keys) to move through it, and{' '}
          <strong>Esc</strong> to leave at any point. You can reopen it later from the{' '}
          <strong>Tutorial</strong> button in the header.
        </p>
      </>
    ),
  },
  {
    id: 'settings-button',
    section: 'Part 1 · Set up the certificate',
    title: 'Open Certificate Settings',
    target: 'cop-settings-button',
    placement: 'bottom',
    onEnter: closeSettings,
    body: (
      <p>
        Everything about how the certificate <em>looks</em> lives here — wording, credit hours,
        background, paper size and signatories. Set this up first: every change shows up
        immediately in the preview and applies to every certificate you generate.
      </p>
    ),
  },
  {
    id: 'title',
    section: 'Part 1 · Set up the certificate',
    title: 'Pick the certificate title',
    target: 'cop-settings-title',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <p>
        Choose between <strong>Participation</strong>, <strong>Appreciation</strong> and{' '}
        <strong>Completion</strong>. This is the heading printed in script at the top of the
        certificate — pick the one that matches what the activity actually awards.
      </p>
    ),
  },
  {
    id: 'body-text',
    section: 'Part 1 · Set up the certificate',
    title: 'Choose or write the body text',
    target: 'cop-settings-body',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <>
        <p className="mb-2">
          Start from one of the three templates, then edit the text freely if the activity needs
          different wording.
        </p>
        <p>
          The placeholders <strong>{'{EventName}'}</strong>, <strong>{'{EventDate}'}</strong>,{' '}
          <strong>{'{Venue}'}</strong>, <strong>{'{CreditPhrase}'}</strong> and{' '}
          <strong>{'{GivenDate}'}</strong> are filled in per participant when the certificate is
          rendered — keep them in place. <strong>Reset</strong> restores the default wording.
        </p>
      </>
    ),
  },
  {
    id: 'credit-hours',
    section: 'Part 1 · Set up the certificate',
    title: 'Set the training credit hours',
    target: 'cop-settings-credit',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <p>
        Enter a whole number of hours and the certificate reads “…with a credit of{' '}
        <strong>Four (4)</strong> training hours.” Leave it blank and that phrase is dropped
        entirely, which is what you want for activities that award no credit.
      </p>
    ),
  },
  {
    id: 'accreditation',
    section: 'Part 1 · Set up the certificate',
    title: 'Add PRC / CPD details',
    target: 'cop-settings-accreditation',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <>
        <p className="mb-2">
          Only needed for activities that carry professional credit — leave both off and the
          certificate prints exactly as before.
        </p>
        <p className="mb-2">
          <strong>Show “PRC License No.” line</strong> prints a blank line under the participant's
          name for them to fill in by hand after printing.
        </p>
        <p>
          Then pick the accreditation line shown above the signatory:{' '}
          <strong>Option 1</strong> for the DILG 10 CPD provider number, or{' '}
          <strong>Option 2</strong> for the PRC accreditation number — whose last segment you can
          change per activity, since it differs from one accredited programme to the next.
        </p>
      </>
    ),
  },
  {
    id: 'theme',
    section: 'Part 1 · Set up the certificate',
    title: 'Choose the background theme',
    target: 'cop-settings-theme',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <p>
        Click any uploaded image to use it as the certificate background, or upload a new one
        (images only, under 5&nbsp;MB). Use a landscape image that matches the paper size you
        picked. Hover a theme to reveal its delete button. With no theme selected the certificate
        prints on plain white.
      </p>
    ),
  },
  {
    id: 'paper-size',
    section: 'Part 1 · Set up the certificate',
    title: 'Pick the paper size',
    target: 'cop-settings-paper',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <p>
        Both sizes are landscape. <strong>A4</strong> prints one certificate per sheet;{' '}
        <strong>A5</strong> pairs two certificates onto a single A4 sheet when you print, so it is
        the cheaper option for large batches.
      </p>
    ),
  },
  {
    id: 'signatories',
    section: 'Part 1 · Set up the certificate',
    title: 'Set the signatories',
    target: 'cop-settings-signatories',
    placement: 'right',
    onEnter: openSettings,
    body: (
      <>
        <p className="mb-2">
          The <strong>primary signatory</strong> is required. Add a <strong>partner agency
          signatory</strong> only for co-organised activities — it needs both an agency name and an
          agency logo, so agencies missing either won't appear in the list.
        </p>
        <p>
          Untick <strong>Include signature image</strong> when the certificates will be signed by
          hand; the name and position still print, only the scanned signature is left off.
        </p>
      </>
    ),
  },
  {
    id: 'save-settings',
    section: 'Part 1 · Set up the certificate',
    title: 'Save and close',
    target: 'cop-settings-save',
    placement: 'top',
    onEnter: openSettings,
    body: (
      <p>
        This saves the chosen <strong>signatories</strong> to the event, so they are still selected
        the next time anyone opens this page. Title, body text, credit hours, PRC/CPD details, theme
        and paper size apply to the current session only — set them again if you come back later.
      </p>
    ),
  },
  {
    id: 'attendance-filter',
    section: 'Part 2 · Filter the participants',
    title: 'Filter by complete or incomplete attendance',
    target: 'cop-attendance-filter',
    placement: 'right',
    onEnter: closeSettings,
    body: (
      <>
        <p className="mb-2">
          <strong>Complete</strong> keeps only participants who were logged present on{' '}
          <em>every</em> event date. <strong>Incomplete</strong> shows the ones who missed at least
          one — normally the people who should <em>not</em> receive a certificate.
        </p>
        <p>
          Each of these also replaces the current selection with everything it matches, so one
          click both filters and selects. <strong>Select All</strong> goes back to the full list;{' '}
          <strong>Unselect</strong> clears the selection.
        </p>
      </>
    ),
  },
  {
    id: 'role-filter',
    section: 'Part 2 · Filter the participants',
    title: 'Filter by role',
    target: 'cop-role-filter',
    placement: 'right',
    body: (
      <p>
        Narrow the list to <strong>Delegate</strong>, <strong>Secretariat/Guest</strong> or{' '}
        <strong>Speaker</strong>, with the headcount shown under each. This stacks with the
        attendance filter, so you can issue different wording to different roles — for example
        pick the Speaker role, switch the title to <em>Certificate of Appreciation</em>, and send
        that batch on its own.
      </p>
    ),
  },
  {
    id: 'search',
    section: 'Part 2 · Filter the participants',
    title: 'Search for specific names',
    target: 'cop-search',
    placement: 'right',
    body: (
      <p>
        Type any part of a name to narrow the visible list further. Search only hides rows — it
        never changes who is selected, so it is safe to use while a batch is already picked.
      </p>
    ),
  },
  {
    id: 'list',
    section: 'Part 2 · Filter the participants',
    title: 'Confirm the selection',
    target: 'cop-participant-list',
    placement: 'right',
    body: (
      <>
        <p className="mb-2">
          Tick or untick individual participants to fine-tune the batch. Only{' '}
          <strong>selected</strong> participants are emailed, printed or exported — the counter
          just above the list is the number you are about to generate.
        </p>
        <p>
          A blue <strong>mail badge</strong> marks anyone who has already been sent their
          certificate, so you can avoid sending duplicates. Click a row to preview it.
        </p>
      </>
    ),
  },
  {
    id: 'preview',
    section: 'Part 3 · Check the preview',
    title: 'Review before you generate',
    target: 'cop-preview',
    placement: 'left',
    body: (
      <p>
        The preview is the real certificate, rendered at the exact export size — what you see here
        is what gets printed. Check the spelling of the name, the dates and the body wording on a
        few records before running a batch. The <strong>eye icon</strong> on a list row opens it
        larger.
      </p>
    ),
  },
  {
    id: 'signature-adjust',
    section: 'Part 3 · Check the preview',
    title: 'Calibrate the signature (optional)',
    target: 'cop-signature-adjust',
    placement: 'bottom',
    body: (
      <p>
        If a scanned signature sits too high, too low or too large over the printed name, open{' '}
        <strong>Adjustment</strong> and nudge its size and position while watching the preview.
        The calibration is remembered per signatory on this browser, so you only have to do it
        once.
      </p>
    ),
  },
  {
    id: 'email',
    section: 'Part 4 · Send them out',
    title: 'Email the certificates',
    target: 'cop-email-button',
    placement: 'bottom',
    body: (
      <>
        <p className="mb-2">
          Renders a PDF per selected participant and emails it to the address on their record.
          Participants without an email address are skipped, and a progress dialog reports each
          send as it happens.
        </p>
        <p>
          Sending is logged, so those rows come back with the blue mail badge. Keep the tab open
          until the batch finishes.
        </p>
      </>
    ),
  },
  {
    id: 'print',
    section: 'Part 4 · Send them out',
    title: 'Print the certificates',
    target: 'cop-print-button',
    placement: 'bottom',
    body: (
      <>
        <p className="mb-2">
          Builds a print-ready document for every selected participant and opens your browser's
          print dialog — A4 one per page, A5 two per page.
        </p>
        <p>
          The page opens in a new tab, so <strong>allow pop-ups</strong> for this site. In the
          print dialog set margins to <strong>None</strong> and turn on background graphics so the
          theme is not clipped.
        </p>
      </>
    ),
  },
  {
    id: 'export',
    section: 'Part 4 · Send them out',
    title: 'Export as PDF files',
    target: 'cop-export-button',
    placement: 'bottom',
    body: (
      <p>
        Downloads the same certificates as high-resolution PDFs — a single file for one
        participant, or a ZIP named after the event for a batch. Use this when you need to archive
        the certificates or hand them over as files.
      </p>
    ),
  },
  {
    id: 'finish',
    title: "You're set",
    placement: 'center',
    body: (
      <>
        <p className="mb-2">
          The short version: <strong>Settings</strong> → filter by <strong>attendance</strong> and{' '}
          <strong>role</strong> → confirm the selection → check the preview →{' '}
          <strong>Email</strong>, <strong>Print</strong> or <strong>Export</strong>.
        </p>
        <p>Reopen this walkthrough any time from the <strong>Tutorial</strong> button in the header.</p>
      </>
    ),
  },
];

// ─── Header trigger ───────────────────────────────────────────────────────────

export const TutorialButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    data-tour="cop-tutorial-button"
    onClick={onClick}
    title="Replay the step-by-step tutorial"
    className="flex items-center justify-center gap-1.5 rounded-lg border border-[#E0DDD4] px-3 py-2 text-sm font-medium text-[#6B6860] transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
  >
    <GraduationCap size={15} /> Tutorial
  </button>
);
