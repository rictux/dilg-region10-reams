-- In-app walkthroughs: which ones a user has already been offered.
--
-- Each guided tour (the Certificate of Participation tour, the Events tour) is shown
-- once, automatically, the first time a user opens its page. Finishing it, skipping it,
-- closing it or pressing Esc all count as "offered" -- after that it is only reachable
-- from the Tutorial button on the page.
--
-- The record lives on the account rather than the browser so it follows the user across
-- devices, and so a shared office PC does not hide the tour from the next person to sign
-- in. lib/userGuides.ts also mirrors it to localStorage, which covers the window before
-- this row comes back and the case where the write below fails outright.
--
-- Shape: guide id -> ISO timestamp, e.g. {"cop": "2026-08-10T01:23:45.000Z"}.
-- Guide ids are the GuideId union in lib/userGuides.ts ('cop', 'events').

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS guides_seen JSONB NOT NULL DEFAULT '{}'::jsonb;
