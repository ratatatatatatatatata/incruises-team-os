-- Dev/preview only. Requires the mentor continuation migration.
-- BEGIN/ROLLBACK removes synthetic rows; identity sequences may still advance.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

DO $test$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_disabled uuid := gen_random_uuid();
  v_sponsor uuid := gen_random_uuid();
  v_old_checkin bigint;
  v_checkin bigint;
  v_new_checkin bigint;
  v_starter uuid;
  v_first uuid;
  v_action public.member_actions%rowtype;
  v_returned public.member_actions%rowtype;
  v_schedule timestamptz := date_trunc('second', now() + interval '1 day');
  v_events bigint;
  v_state text;
  v_case record;
  v_identity record;
  v_passed text[] := ARRAY[]::text[];
BEGIN
  -- Fail before fixtures if the target migration is missing.
  IF to_regprocedure(
    'public.continue_my_member_path(bigint,integer,text,text,text,integer,integer)'
  ) IS NULL OR to_regprocedure(
    'public.schedule_my_member_action(uuid,timestamp with time zone)'
  ) IS NULL THEN
    RAISE EXCEPTION 'BLOCKED: mentor migration/RPCs are missing';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.continue_my_member_path(bigint,integer,text,text,text,integer,integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.schedule_my_member_action(uuid,timestamp with time zone)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: anon can execute a mentor RPC';
  END IF;
  v_passed := array_append(v_passed, 'anon execute denied');

  -- No matching invitation: the known invite-only auth trigger creates no membership.
  INSERT INTO auth.users (id, email, created_at, updated_at)
  SELECT id, 'mentor-runtime-' || id::text || '@invalid.example', now(), now()
  FROM unnest(ARRAY[v_owner, v_other, v_disabled, v_sponsor]) AS fixture(id);

  INSERT INTO public.team_members
    (user_id, role, status, onboarding_required)
  VALUES
    (v_owner, 'user', 'active', false),
    (v_other, 'user', 'active', false),
    (v_disabled, 'user', 'disabled', false),
    (v_sponsor, 'coach', 'active', false);

  INSERT INTO public.member_relationships
    (member_user_id, sponsor_user_id, team_name, created_by)
  VALUES
    (v_owner, v_sponsor, 'Synthetic mentor runtime test', v_owner);

  -- No academyRecommendation: no external lesson/catalog dependency.
  -- Empty weeklyActions means completing the generated starter leaves no active action.
  INSERT INTO public.member_success_maps (
    user_id, current_context, goal_30_day, weekly_capacity,
    primary_blocker, growth_preferences, plan, plan_source,
    plan_version, ai_consent, support_summary_consent
  ) VALUES (
    v_owner,
    'Зөвхөн туршилтад зориулсан өдөр тутмын нөхцөл.',
    'Зөвхөн туршилтад зориулсан гуч хоногийн зорилго.',
    '5 минут',
    'Зөвхөн туршилтад зориулсан саадын мэдээлэл.',
    'Нэг удаад нэг жижиг ажил хийх туршилтын сонголт.',
    jsonb_build_object(
      'todayAction', jsonb_build_object(
        'title', 'Туршилтын эхний ажил',
        'detail', 'Туршилтын нэг жижиг алхмыг хийх.',
        'doneWhen', 'Туршилтын эхний алхам дууссан байна.',
        'minutes', 5
      ),
      'weeklyActions', '[]'::jsonb
    ),
    'deterministic', 1, false, false
  );

  SELECT id INTO STRICT v_starter
  FROM public.member_actions
  WHERE member_user_id = v_owner
    AND status NOT IN ('done', 'superseded');

  INSERT INTO public.member_checkins (
    user_id, progress_summary, next_focus, progress_percent, created_at
  ) VALUES (
    v_owner, 'Хуучин туршилтын явц.', 'Хуучин туршилтын дараагийн ажил.',
    50, now() - interval '2 minutes'
  ) RETURNING id INTO v_old_checkin;

  INSERT INTO public.member_checkins (
    user_id, progress_summary, next_focus, progress_percent, created_at
  ) VALUES (
    v_owner, 'Одоогийн туршилтын явц.', 'Одоогийн туршилтын дараагийн ажил.',
    50, now() - interval '1 minute'
  ) RETURNING id INTO v_checkin;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );

  IF NOT row_security_active('public.member_actions')
     OR NOT row_security_active('public.member_action_events')
     OR NOT row_security_active('public.member_checkins')
     OR NOT row_security_active('public.member_success_summaries') THEN
    RAISE EXCEPTION 'FAIL: fixture session is not subject to expected RLS';
  END IF;

  PERFORM public.transition_my_member_action(
    v_starter, 'done', '', NULL, ''
  );

  IF EXISTS (
    SELECT 1 FROM public.member_actions
    WHERE member_user_id = v_owner
      AND status NOT IN ('done', 'superseded')
  ) THEN
    RAISE EXCEPTION 'BLOCKED: starter completion unexpectedly created another action';
  END IF;

  -- Owner rejection cases must fail with the precise validation SQLSTATE.
  FOR v_case IN
    SELECT * FROM (VALUES
      (
        'stale plan rejected',
        format(
          'SELECT public.continue_my_member_path(%L,2,%L,%L,%L,5,5)',
          v_checkin, 'Туршилтын ажил', 'Туршилтын дэлгэрэнгүй.',
          'Туршилтын ажил дууссан.'
        )
      ),
      (
        'stale check-in rejected',
        format(
          'SELECT public.continue_my_member_path(%L,1,%L,%L,%L,5,5)',
          v_old_checkin, 'Туршилтын ажил', 'Туршилтын дэлгэрэнгүй.',
          'Туршилтын ажил дууссан.'
        )
      ),
      (
        'five-minute capacity cannot be inflated',
        format(
          'SELECT public.continue_my_member_path(%L,1,%L,%L,%L,6,6)',
          v_checkin, 'Туршилтын ажил', 'Туршилтын дэлгэрэнгүй.',
          'Туршилтын ажил дууссан.'
        )
      )
    ) AS cases(label, statement)
  LOOP
    BEGIN
      EXECUTE v_case.statement;
      RAISE EXCEPTION 'Unexpected success: %', v_case.label;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      IF v_state <> '22023' THEN
        RAISE EXCEPTION 'FAIL: %; expected 22023, received %',
          v_case.label, v_state;
      END IF;
    END;
    v_passed := array_append(v_passed, v_case.label);
  END LOOP;

  SELECT * INTO v_action
  FROM public.continue_my_member_path(
    v_checkin, 1,
    'Туршилтын дараагийн ажил',
    'Туршилтын нэг жижиг алхмыг таван минутад хийх.',
    'Туршилтын нэг жижиг алхам дууссан байна.',
    5, 5
  );
  v_first := v_action.id;

  IF v_first IS NULL
     OR v_action.member_user_id IS DISTINCT FROM v_owner
     OR v_action.source_checkin_id IS DISTINCT FROM v_checkin
     OR v_action.status IS DISTINCT FROM 'proposed'
     OR v_action.minutes IS DISTINCT FROM 5
     OR v_action.capacity_minutes IS DISTINCT FROM 5
     OR v_action.sequence_no < 4 THEN
    RAISE EXCEPTION 'FAIL: owner continuation returned an invalid canonical action';
  END IF;
  v_passed := array_append(v_passed, 'owner continuation and five-minute action');

  SELECT * INTO v_returned
  FROM public.continue_my_member_path(
    v_checkin, 1, 'Өөрчлөгдөх ёсгүй гарчиг',
    'Өөрчлөгдөх ёсгүй дэлгэрэнгүй.', 'Өөрчлөгдөх ёсгүй шалгуур.', 5, 5
  );
  IF v_returned.id IS DISTINCT FROM v_first
     OR v_returned.title IS DISTINCT FROM v_action.title
     OR (
       SELECT count(*) FROM public.member_actions
       WHERE source_checkin_id = v_checkin
     ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: retry was not idempotent';
  END IF;
  v_passed := array_append(v_passed, 'same check-in is idempotent');

  INSERT INTO public.member_checkins (
    user_id, progress_summary, next_focus, progress_percent
  ) VALUES (
    v_owner, 'Шинэ туршилтын явц.', 'Шинэ туршилтын дараагийн ажил.', 50
  ) RETURNING id INTO v_new_checkin;

  SELECT * INTO v_returned
  FROM public.continue_my_member_path(
    v_new_checkin, 1, 'Идэвхтэй ажлыг солих ёсгүй',
    'Идэвхтэй ажлыг өөрчлөх ёсгүй.', 'Идэвхтэй ажил хэвээр байна.', 5, 5
  );
  IF v_returned.id IS DISTINCT FROM v_first
     OR EXISTS (
       SELECT 1 FROM public.member_actions
       WHERE source_checkin_id = v_new_checkin
     )
     OR (
       SELECT count(*) FROM public.member_actions
       WHERE member_user_id = v_owner
         AND status NOT IN ('done', 'superseded')
     ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: existing active action was not preserved';
  END IF;
  v_passed := array_append(v_passed, 'existing active action preserved');

  -- Schedule, retry, clear: exactly two scheduling audit events.
  SELECT count(*) INTO v_events
  FROM public.member_action_events
  WHERE action_id = v_first AND event_type = 'time_changed'
    AND metadata->>'field' = 'planned_for';

  SELECT * INTO v_returned
  FROM public.schedule_my_member_action(v_first, v_schedule);
  IF v_returned.planned_for IS DISTINCT FROM v_schedule THEN
    RAISE EXCEPTION 'FAIL: own scheduling did not persist';
  END IF;

  PERFORM public.schedule_my_member_action(v_first, v_schedule);
  IF (
    SELECT count(*) FROM public.member_action_events
    WHERE action_id = v_first AND event_type = 'time_changed'
      AND metadata->>'field' = 'planned_for'
  ) <> v_events + 1 THEN
    RAISE EXCEPTION 'FAIL: scheduling retry created an extra audit event';
  END IF;

  SELECT * INTO v_returned
  FROM public.schedule_my_member_action(v_first, NULL::timestamptz);
  IF v_returned.planned_for IS NOT NULL OR (
    SELECT count(*) FROM public.member_action_events
    WHERE action_id = v_first AND event_type = 'time_changed'
      AND metadata->>'field' = 'planned_for'
  ) <> v_events + 2 THEN
    RAISE EXCEPTION 'FAIL: schedule clear/audit event is incorrect';
  END IF;
  v_passed := array_append(v_passed, 'own schedule, idempotent retry, clear and audit');

  BEGIN
    PERFORM public.schedule_my_member_action(v_first, 'infinity'::timestamptz);
    RAISE EXCEPTION 'Unexpected infinity success';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '22023' THEN
      RAISE EXCEPTION 'FAIL: infinity expected 22023, received %', v_state;
    END IF;
  END;
  v_passed := array_append(v_passed, 'infinity schedule rejected');

  -- Both RPCs: another active user, disabled user, and missing auth identity.
  FOR v_identity IN
    SELECT * FROM (VALUES
      (v_other, 'non-owner', 'P0002'),
      (v_disabled, 'disabled', '42501'),
      (NULL::uuid, 'null-auth', '42501')
    ) AS identities(id, label, expected_state)
  LOOP
    PERFORM set_config(
      'request.jwt.claim.sub', coalesce(v_identity.id::text, ''), true
    );
    PERFORM set_config(
      'request.jwt.claims',
      CASE WHEN v_identity.id IS NULL THEN '{"role":"authenticated"}'
      ELSE jsonb_build_object(
        'sub', v_identity.id::text, 'role', 'authenticated'
      )::text END,
      true
    );

    FOR v_case IN
      SELECT * FROM (VALUES
        (
          'continuation',
          format(
            'SELECT public.continue_my_member_path(%L,1,%L,%L,%L,5,5)',
            v_checkin, 'Хориглох туршилтын ажил',
            'Хориглох туршилтын дэлгэрэнгүй.', 'Хориглох туршилтын шалгуур.'
          )
        ),
        (
          'scheduling',
          format(
            'SELECT public.schedule_my_member_action(%L::uuid,%L::timestamptz)',
            v_first, v_schedule
          )
        )
      ) AS cases(label, statement)
    LOOP
      BEGIN
        EXECUTE v_case.statement;
        RAISE EXCEPTION 'Unexpected authorization success';
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state <> v_identity.expected_state THEN
          RAISE EXCEPTION 'FAIL: % %; expected %, received %',
            v_identity.label, v_case.label,
            v_identity.expected_state, v_state;
        END IF;
      END;
      v_passed := array_append(
        v_passed, v_identity.label || ' ' || v_case.label || ' denied'
      );
    END LOOP;
  END LOOP;

  -- A genuine directly assigned sponsor cannot read private support records.
  PERFORM set_config('request.jwt.claim.sub', v_sponsor::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_sponsor::text, 'role', 'authenticated')::text,
    true
  );
  IF NOT private.current_user_is_direct_supporter(v_owner) THEN
    RAISE EXCEPTION 'BLOCKED: synthetic sponsor relationship is not recognized';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.member_actions WHERE member_user_id = v_owner
  ) OR EXISTS (
    SELECT 1 FROM public.member_action_events WHERE member_user_id = v_owner
  ) OR EXISTS (
    SELECT 1 FROM public.member_checkins WHERE user_id = v_owner
  ) OR EXISTS (
    SELECT 1 FROM public.member_success_summaries WHERE user_id = v_owner
  ) OR EXISTS (
    SELECT 1 FROM public.member_success_maps WHERE user_id = v_owner
  ) THEN
    RAISE EXCEPTION 'FAIL: consent=false leaked owner records to sponsor';
  END IF;
  v_passed := array_append(v_passed, 'consent=false blocks assigned sponsor visibility');

  -- Restore owner and verify terminal behavior.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM public.transition_my_member_action(v_first, 'done', '', NULL, '');

  BEGIN
    PERFORM public.schedule_my_member_action(v_first, v_schedule);
    RAISE EXCEPTION 'Unexpected terminal schedule success';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '22023' THEN
      RAISE EXCEPTION 'FAIL: terminal schedule expected 22023, received %', v_state;
    END IF;
  END;
  v_passed := array_append(v_passed, 'terminal action scheduling rejected');

  SELECT * INTO v_returned
  FROM public.continue_my_member_path(
    v_checkin, 1, 'Давтан туршилтын ажил',
    'Давтан туршилтын дэлгэрэнгүй.', 'Давтан туршилтын шалгуур.', 5, 5
  );
  IF v_returned.id IS DISTINCT FROM v_first
     OR v_returned.status IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'FAIL: completed action retry was not idempotent';
  END IF;
  v_passed := array_append(v_passed, 'completed check-in retry preserves original action');

  SELECT * INTO v_returned
  FROM public.continue_my_member_path(
    v_new_checkin, 1, 'Дараагийн шинэ туршилтын ажил',
    'Дараагийн шинэ туршилтын дэлгэрэнгүй.',
    'Дараагийн шинэ туршилтын шалгуур.', 5, 5
  );
  IF v_returned.id IS NULL
     OR v_returned.id = v_first
     OR v_returned.source_checkin_id IS DISTINCT FROM v_new_checkin
     OR (
       SELECT count(*) FROM public.member_actions
       WHERE member_user_id = v_owner
         AND status NOT IN ('done', 'superseded')
     ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: latest check-in did not create exactly one next action';
  END IF;
  v_passed := array_append(v_passed, 'latest check-in continues after completion');

  EXECUTE 'RESET ROLE';
  PERFORM set_config('mentor_runtime.results', to_json(v_passed)::text, true);
END
$test$;

SELECT jsonb_build_object(
  'status', 'PASS — rollback follows',
  'checks', current_setting('mentor_runtime.results')::jsonb,
  'caveat', 'Synthetic rows roll back; identity sequence counters may advance.'
) AS mentor_runtime_result;

ROLLBACK;
