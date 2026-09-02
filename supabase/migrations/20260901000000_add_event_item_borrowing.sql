-- Event-level opt-in for the item borrowing workflow. Only the two offices with
-- managed borrowing inventories may enable it.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS has_item_borrowing BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'events_item_borrowing_office_chk'
          AND conrelid = 'public.events'::regclass
    ) THEN
        ALTER TABLE public.events
            ADD CONSTRAINT events_item_borrowing_office_chk
            CHECK (NOT has_item_borrowing OR organize_by IN (3, 12));
    END IF;
END $$;
