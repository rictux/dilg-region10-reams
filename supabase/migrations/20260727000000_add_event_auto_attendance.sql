ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS auto_attendance_on_registration BOOLEAN NOT NULL DEFAULT FALSE;

-- Remove the earlier global trigger implementation, if present. Staff-side Add
-- Participant attendance remains controlled by its own explicit checkbox.
DROP TRIGGER IF EXISTS event_participants_auto_attendance_trg
ON public.event_participants;

DROP FUNCTION IF EXISTS public.log_attendance_on_event_registration();

-- Called only by the public Event Registration page after a successful
-- registration. The function validates the event setting, a recent matching
-- registration, and the Philippine event date before writing attendance.
CREATE OR REPLACE FUNCTION public.log_public_event_registration_attendance(
    p_event_id BIGINT,
    p_participant_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event public.events%ROWTYPE;
    v_participant_id BIGINT;
    v_scan_time TIMESTAMP WITH TIME ZONE := clock_timestamp();
    v_attendance_date DATE;
    v_action_session TEXT;
BEGIN
    IF p_event_id IS NULL
       OR p_event_id <= 0
       OR NULLIF(BTRIM(p_participant_code), '') IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT p.participant_id
    INTO v_participant_id
    FROM public.participants p
    INNER JOIN public.event_participants ep
        ON ep.participant_id = p.participant_id
       AND ep.event_id = p_event_id
       AND ep.registration_status = 'Registered'
       AND ep.registered_at >= v_scan_time - INTERVAL '5 minutes'
    WHERE p.participant_code = p_participant_code
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT *
    INTO v_event
    FROM public.events
    WHERE event_id = p_event_id
      AND deleted_at IS NULL;

    IF NOT FOUND OR NOT COALESCE(v_event.auto_attendance_on_registration, FALSE) THEN
        RETURN NULL;
    END IF;

    v_attendance_date := (v_scan_time AT TIME ZONE 'Asia/Manila')::DATE;

    IF v_attendance_date < v_event.start_date
       OR v_attendance_date > v_event.end_date THEN
        RETURN NULL;
    END IF;

    v_action_session := CASE
        WHEN v_event.session = 'PM' THEN 'PM'
        ELSE 'AM'
    END;

    INSERT INTO public.attendance_logs (
        event_id,
        participant_id,
        user_id,
        attendance_date,
        scan_time,
        action_session,
        scan_status,
        scanner_device,
        remarks
    )
    SELECT
        p_event_id,
        v_participant_id,
        NULL,
        v_attendance_date,
        v_scan_time,
        v_action_session,
        'Valid',
        'Event Registration',
        'Auto-logged from Event Registration (' || v_action_session || ')'
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.attendance_logs
        WHERE event_id = p_event_id
          AND participant_id = v_participant_id
          AND attendance_date = v_attendance_date
          AND action_session = v_action_session
          AND scan_status IN ('Valid', 'Late')
    );

    RETURN v_action_session;
END;
$$;

REVOKE ALL ON FUNCTION public.log_public_event_registration_attendance(BIGINT, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_public_event_registration_attendance(BIGINT, TEXT)
TO anon, authenticated;
