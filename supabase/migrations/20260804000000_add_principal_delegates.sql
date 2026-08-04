-- Principal / Representative delegates.
--
-- Some events seat a "Principal" delegate (the official whose seat it is) who may
-- instead send a "Representative" in their place. The distinction only exists for
-- events that opt in, and only applies to participants registered as Delegates --
-- Speaker / Secretariat / Guest / VIP keep their own meaning and never carry a
-- delegate type.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS has_principal_delegates BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.event_participants
    ADD COLUMN IF NOT EXISTS delegate_type TEXT;

-- Couples delegate_type to role so the two can never disagree: clearing or changing
-- role away from 'Delegate' must also clear delegate_type.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'event_participants_delegate_type_chk'
          AND conrelid = 'public.event_participants'::regclass
    ) THEN
        ALTER TABLE public.event_participants
            ADD CONSTRAINT event_participants_delegate_type_chk
            CHECK (
                delegate_type IS NULL
                OR (delegate_type IN ('Principal', 'Representative') AND role = 'Delegate')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS event_participants_principal_idx
    ON public.event_participants(event_id)
    WHERE delegate_type = 'Principal';
