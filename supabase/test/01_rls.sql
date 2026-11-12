-- Проверка изоляции двух пользователей. Любое нарушение валит скрипт с ошибкой.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'petr@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'yulia@example.com');

-- общее упражнение (как при импорте базы сервисным ключом)
insert into public.exercises (id, owner_id, slug, name_ru, name_en, primary_muscles, equipment)
values ('33333333-3333-3333-3333-333333333333', null, 'squat', 'Приседания со штангой', 'Barbell Squat', '{quadriceps}', 'barbell');

create or replace function assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'ПРОВАЛ: %', msg; end if; end $$;

-- ─── Пётр пишет тренировку ──────────────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.sessions (id, date) values ('44444444-4444-4444-4444-444444444444', '2026-11-12');
select assert((select count(*) from public.sessions) = 1, 'Пётр не видит свою тренировку');

-- подложить чужой user_id нельзя
do $$ begin
  begin
    insert into public.sessions (user_id, date)
    values ('22222222-2222-2222-2222-222222222222', '2026-11-12');
    raise exception 'ПРОВАЛ: удалось записать строку от имени другого пользователя';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ─── Юлия не видит ничего из этого ──────────────────────────────────────────
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select assert((select count(*) from public.sessions) = 0, 'Юлия видит тренировки Петра');

-- и не может их изменить
with upd as (update public.sessions set note = 'взломано' returning 1)
select assert((select count(*) from upd) = 0, 'Юлия изменила тренировку Петра');

-- и не может удалить: права на delete не выданы
do $$ begin
  begin
    delete from public.sessions;
    raise exception 'ПРОВАЛ: удаление строк разрешено';
  exception when insufficient_privilege then null;
  end;
end $$;

-- общий справочник читают оба
select assert((select count(*) from public.exercises) = 1, 'Юлия не видит общий справочник');

-- но править общую строку нельзя
with upd as (update public.exercises set name_ru = 'взломано' where owner_id is null returning 1)
select assert((select count(*) from upd) = 0, 'Юлия изменила общее упражнение');

-- своё упражнение добавить можно
insert into public.exercises (owner_id, name_ru, is_custom, primary_muscles)
values ('22222222-2222-2222-2222-222222222222', 'Моё упражнение', true, '{chest}');
select assert((select count(*) from public.exercises) = 2, 'Юлия не видит своё упражнение');

-- а Пётр её упражнение не видит
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select assert((select count(*) from public.exercises) = 1, 'Пётр видит упражнение Юлии');

-- ─── мягкое удаление работает как обычная правка ────────────────────────────
update public.sessions set deleted_at = now() where id = '44444444-4444-4444-4444-444444444444';
select assert(
  (select deleted_at is not null from public.sessions where id = '44444444-4444-4444-4444-444444444444'),
  'мягкое удаление не записалось');

-- ─── updated_at двигается триггером и годится как курсор синхронизации ──────
do $$
declare before_ts timestamptz; after_ts timestamptz;
begin
  select updated_at into before_ts from public.sessions where id = '44444444-4444-4444-4444-444444444444';
  update public.sessions set note = 'правка' where id = '44444444-4444-4444-4444-444444444444';
  select updated_at into after_ts from public.sessions where id = '44444444-4444-4444-4444-444444444444';
  if after_ts <= before_ts then raise exception 'ПРОВАЛ: updated_at не вырос'; end if;
end $$;

reset role;
select 'OK: изоляция данных, мягкое удаление' as result;

-- ─── два времени: правка устройства и время сервера ─────────────────────────
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare srv_before timestamptz; srv_after timestamptz; upd timestamptz;
begin
  select server_updated_at into srv_before from public.sessions
   where id = '44444444-4444-4444-4444-444444444444';

  -- клиент присылает своё время правки (офлайн-правка, сделанная вчера)
  update public.sessions
     set note = 'офлайн-правка', updated_at = '2026-11-11T08:00:00Z'
   where id = '44444444-4444-4444-4444-444444444444';

  select updated_at, server_updated_at into upd, srv_after from public.sessions
   where id = '44444444-4444-4444-4444-444444444444';

  if upd <> '2026-11-11T08:00:00Z'::timestamptz then
    raise exception 'ПРОВАЛ: сервер перезаписал время правки устройства (%)', upd;
  end if;
  if srv_after <= srv_before then
    raise exception 'ПРОВАЛ: server_updated_at не вырос, вычитка пропустит строку';
  end if;
end $$;
reset role;
select 'OK: время правки устройства сохранено, курсор сервера растёт' as result;
