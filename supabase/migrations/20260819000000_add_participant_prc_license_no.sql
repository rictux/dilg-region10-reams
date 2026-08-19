-- PRC license numbers are stored as text so leading zeroes are preserved.
ALTER TABLE public.participants
    ADD COLUMN IF NOT EXISTS prc_license_no TEXT;

COMMENT ON COLUMN public.participants.prc_license_no IS
    'Optional Professional Regulation Commission license number; stored as text to preserve leading zeroes.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'participants_prc_license_no_chk'
          AND conrelid = 'public.participants'::regclass
    ) THEN
        ALTER TABLE public.participants
            ADD CONSTRAINT participants_prc_license_no_chk
            CHECK (
                prc_license_no IS NULL
                OR prc_license_no ~ '^[0-9]{1,20}$'
            );
    END IF;
END $$;
