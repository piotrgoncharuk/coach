-- ============================================================================
--  Coach — начальная схема
--  Правила, которые держатся по всей базе:
--   • у каждой пользовательской таблицы есть user_id и RLS user_id = auth.uid();
--   • физического удаления нет — только deleted_at (soft delete);
--   • updated_at обновляется триггером и служит курсором синхронизации;
--   • данные двух пользователей полностью изолированы: общих таблиц нет,
--     кроме справочника упражнений, который только читается.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ─── общий триггер updated_at ───────────────────────────────────────────────
-- Два времени у каждой строки, и это важно для офлайна:
--   updated_at        — когда правка сделана на устройстве. По нему решается конфликт
--                       (last-write-wins). Если клиент прислал своё значение, триггер
--                       его не трогает: иначе правка, сделанная офлайн вчера, получила бы
--                       сегодняшнее время и другое устройство её бы не заметило.
--   server_updated_at — когда строка доехала до сервера. Только по нему клиенты вычитывают
--                       изменения, поэтому вчерашняя правка не теряется.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at is null or new.updated_at = old.updated_at then
    new.updated_at := greatest(now(), old.updated_at + interval '1 microsecond');
  end if;
  new.server_updated_at := greatest(now(), old.server_updated_at + interval '1 microsecond');
  return new;
end;
$$;

-- ─── профиль ────────────────────────────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  display_name    text not null default '',
  height_cm       numeric(5,1),
  birth_date      date,
  -- Цели питания живут в профиле и не привязаны к цели по весу тела.
  kcal_target     integer not null default 3000,
  protein_target  integer not null default 190,
  -- Цель по весу: null — цели нет, показываем только факт и динамику.
  weight_goal_kg  numeric(5,1),
  weight_rate_kg_week numeric(4,2),
  theme           text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  rest_sec_default integer not null default 120,
  -- Ограничения здоровья: массив кодов, влияет на осторожный режим прогрессии.
  limitations     text[] not null default '{}',
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- ─── справочник упражнений ──────────────────────────────────────────────────
-- owner_id is null → общая строка из free-exercise-db, только для чтения.
-- owner_id = auth.uid() → своё упражнение пользователя.
create table public.exercises (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references auth.users on delete cascade,
  slug              text,
  name_ru           text not null,
  name_en           text,
  primary_muscles   text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment         text,
  level             text,
  force             text,
  mechanic          text,
  category          text,
  instructions_ru   text[] not null default '{}',
  instructions_en   text[] not null default '{}',
  cues_ru           text[] not null default '{}',
  mistakes_ru       text[] not null default '{}',
  image_start       text,
  image_end         text,
  youtube_url       text,
  default_rest_sec  integer,
  -- Движения, которые по умолчанию идут в осторожном режиме (спина, бедро).
  cautious_default  boolean not null default false,
  is_custom         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index exercises_slug_global_idx on public.exercises (slug) where owner_id is null;
create index exercises_owner_idx on public.exercises (owner_id);
create index exercises_updated_idx on public.exercises (updated_at);

-- Мои настройки по упражнению: заметка, своё видео, свой отдых.
create table public.user_exercise_prefs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id   uuid not null references public.exercises on delete cascade,
  note          text,
  youtube_url   text,
  rest_sec      integer,
  pinned        boolean not null default false,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (user_id, exercise_id)
);

-- ─── программа ──────────────────────────────────────────────────────────────
create table public.programs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  version     integer not null default 1,
  parent_id   uuid references public.programs on delete set null,
  is_active   boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index programs_user_idx on public.programs (user_id, updated_at);

create table public.program_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  program_id  uuid not null references public.programs on delete cascade,
  order_index integer not null,
  name        text not null,
  focus       text,
  heavy_legs  boolean not null default false,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index program_days_program_idx on public.program_days (program_id, order_index);

create table public.program_exercises (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  program_day_id  uuid not null references public.program_days on delete cascade,
  exercise_id     uuid not null references public.exercises on delete restrict,
  order_index     integer not null,
  target_sets     integer not null default 3,
  rep_min         integer not null default 6,
  rep_max         integer not null default 10,
  target_rir      integer not null default 2 check (target_rir between 0 and 4),
  rest_sec        integer not null default 120,
  increment_kg    numeric(5,2),
  cautious        boolean not null default false,
  superset_group  text,
  notes           text,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index program_exercises_day_idx on public.program_exercises (program_day_id, order_index);

-- ─── календарь ──────────────────────────────────────────────────────────────
create table public.calendar_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  date            date not null,
  type            text not null check (type in ('gym', 'football', 'rest')),
  program_day_id  uuid references public.program_days on delete set null,
  duration_min    integer,
  intensity       integer check (intensity between 1 and 10),
  status          text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index calendar_user_date_idx on public.calendar_events (user_id, date);

-- ─── тренировки ─────────────────────────────────────────────────────────────
create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  date            date not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  program_day_id  uuid references public.program_days on delete set null,
  status          text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  difficulty      integer check (difficulty between 1 and 10),
  note            text,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index sessions_user_date_idx on public.sessions (user_id, date desc);

create table public.session_exercises (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  session_id       uuid not null references public.sessions on delete cascade,
  exercise_id      uuid not null references public.exercises on delete restrict,
  order_index      integer not null,
  substituted_from uuid references public.exercises on delete set null,
  superset_group   text,
  target_sets      integer,
  rep_min          integer,
  rep_max          integer,
  target_rir       integer,
  rest_sec         integer,
  note             text,
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index session_exercises_session_idx on public.session_exercises (session_id, order_index);

create table public.sets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users on delete cascade,
  session_exercise_id uuid not null references public.session_exercises on delete cascade,
  exercise_id         uuid not null references public.exercises on delete restrict,
  set_index           integer not null,
  weight_kg           numeric(6,2) not null,
  reps                integer not null,
  rir                 integer check (rir between 0 and 4),
  type                text not null default 'work' check (type in ('warmup', 'work', 'drop', 'failure')),
  e1rm                numeric(6,2),
  is_pr               boolean not null default false,
  performed_at        timestamptz not null default now(),
  note                text,
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index sets_user_exercise_idx on public.sets (user_id, exercise_id, performed_at desc);
create index sets_session_exercise_idx on public.sets (session_exercise_id, set_index);

create table public.personal_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id  uuid not null references public.exercises on delete cascade,
  kind         text not null check (kind in ('weight', 'reps', 'e1rm')),
  value        numeric(7,2) not null,
  weight_kg    numeric(6,2),
  reps         integer,
  set_id       uuid references public.sets on delete set null,
  achieved_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index pr_user_exercise_idx on public.personal_records (user_id, exercise_id, kind);

-- ─── тело, питание, восстановление ──────────────────────────────────────────
create table public.body_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  date        date not null,
  weight_kg   numeric(5,1),
  chest_cm    numeric(5,1),
  waist_cm    numeric(5,1),
  hips_cm     numeric(5,1),
  biceps_cm   numeric(5,1),
  thigh_cm    numeric(5,1),
  neck_cm     numeric(5,1),
  note        text,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (user_id, date)
);

create table public.saved_meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  kcal        integer not null,
  protein_g   integer not null,
  use_count   integer not null default 0,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.nutrition_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  date          date not null,
  name          text not null,
  kcal          integer not null,
  protein_g     integer not null,
  saved_meal_id uuid references public.saved_meals on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index nutrition_user_date_idx on public.nutrition_entries (user_id, date);

create table public.readiness_checkins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  date        date not null,
  sleep_hours numeric(3,1) not null,
  energy      integer not null check (energy between 1 and 5),
  soreness    integer not null check (soreness between 1 and 5),
  stress      integer not null check (stress between 1 and 5),
  score       integer,
  flag        text check (flag in ('green', 'yellow', 'red')),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (user_id, date)
);

-- ─── тренер ─────────────────────────────────────────────────────────────────
create table public.coach_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  author      text not null default 'coach' check (author in ('coach', 'me')),
  text        text not null,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index coach_notes_user_idx on public.coach_notes (user_id, created_at desc);

-- Правка программы от тренера. Единственный способ записи для ИИ:
-- это черновик, который применяется только из приложения.
create table public.program_change_proposals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  source        text not null default 'coach' check (source in ('coach', 'manual')),
  title         text not null,
  rationale     text,
  payload       jsonb not null,
  diff          jsonb,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index proposals_user_status_idx on public.program_change_proposals (user_id, status);

-- Личные токены для MCP. Хранится только хэш — сам токен показывается один раз.
create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  name         text not null,
  token_hash   text not null unique,
  prefix       text not null,
  scopes       text[] not null default '{read,propose}',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ─── триггеры updated_at ────────────────────────────────────────────────────
do $$
declare
  t text;
  owner_col text;
begin
  foreach t in array array[
    'profiles', 'exercises', 'user_exercise_prefs', 'programs', 'program_days',
    'program_exercises', 'calendar_events', 'sessions', 'session_exercises', 'sets',
    'personal_records', 'body_metrics', 'saved_meals', 'nutrition_entries',
    'readiness_checkins', 'coach_notes', 'program_change_proposals', 'api_tokens'
  ]
  loop
    -- у профиля владелец в id, у упражнений — в owner_id, у остальных — user_id
    owner_col := case t
      when 'profiles' then 'id'
      when 'exercises' then 'owner_id'
      else 'user_id'
    end;

    execute format(
      'alter table public.%I add column server_updated_at timestamptz not null default now()', t);
    -- курсор вычитки: «что изменилось у меня после такого-то времени сервера»
    execute format('create index %I on public.%I (%I, server_updated_at)',
                   t || '_sync_idx', t, owner_col);
    execute format(
      'create trigger %I_touch before update on public.%I
         for each row execute function public.touch_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ─── политики доступа ───────────────────────────────────────────────────────
-- Профиль: строка принадлежит самому пользователю (id = auth.uid()).
create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Упражнения: общие читают все вошедшие, писать можно только свои.
create policy exercises_select on public.exercises for select
  using (owner_id is null or owner_id = auth.uid());
create policy exercises_insert on public.exercises for insert
  with check (owner_id = auth.uid() and is_custom);
create policy exercises_update on public.exercises for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Остальные таблицы: строго свои строки, удаления нет (только update deleted_at).
do $$
declare t text;
begin
  foreach t in array array[
    'user_exercise_prefs', 'programs', 'program_days', 'program_exercises',
    'calendar_events', 'sessions', 'session_exercises', 'sets', 'personal_records',
    'body_metrics', 'saved_meals', 'nutrition_entries', 'readiness_checkins',
    'coach_notes', 'program_change_proposals', 'api_tokens'
  ]
  loop
    execute format('create policy %I_select on public.%I for select using (user_id = auth.uid())', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (user_id = auth.uid())', t, t);
    execute format('create policy %I_update on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- Политик for delete нет ни у одной таблицы: удалить строку клиент не может.
-- Удаление делается как update с deleted_at.

-- ─── профиль создаётся сам при регистрации ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── права ──────────────────────────────────────────────────────────────────
-- Клиент ходит под ролью authenticated. Права на delete не выдаются совсем:
-- вместе с отсутствием политик delete это вторая независимая преграда.
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
revoke delete on all tables in schema public from authenticated;
