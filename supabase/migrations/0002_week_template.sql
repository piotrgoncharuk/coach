-- Шаблон недели и разгрузка: дни зала и футбола по умолчанию,
-- чтобы календарь заполнялся сам, а планировщик знал про постоянный футбол.
alter table public.profiles
  add column gym_weekdays      integer[] not null default '{}',
  add column football_weekdays integer[] not null default '{}',
  add column deload_start      date;

alter table public.profiles
  add constraint profiles_gym_weekdays_range
    check (gym_weekdays <@ array[0,1,2,3,4,5,6]),
  add constraint profiles_football_weekdays_range
    check (football_weekdays <@ array[0,1,2,3,4,5,6]);

-- Категория упражнения нужна фильтру «только силовые».
create index if not exists exercises_category_idx on public.exercises (category);
