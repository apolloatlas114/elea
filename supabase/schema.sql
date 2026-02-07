create extension if not exists "uuid-ossp";

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  studiengang text not null,
  hochschule text,
  abgabedatum date not null,
  status int not null default 0,
  zielnote text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  updated_at timestamp with time zone default now()
);

create table if not exists assessment_results (
  user_id uuid primary key references auth.users(id) on delete cascade,
  answers jsonb not null,
  score int not null,
  recommended_plan text not null,
  reasons text[] not null,
  completed_at timestamp with time zone not null,
  created_at timestamp with time zone default now()
);

create table if not exists school_content (
  id text primary key,
  modules jsonb not null,
  updated_at timestamp with time zone default now()
);

create table if not exists school_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lessons jsonb not null,
  last_lesson_id text,
  updated_at timestamp with time zone default now()
);

create table if not exists todos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  detail text,
  due_date date not null,
  created_at timestamp with time zone default now()
);

create index if not exists todos_user_id_idx on todos(user_id);

create table if not exists thesis_documents (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  size bigint not null default 0,
  type text,
  last_modified bigint not null default 0,
  uploaded_at timestamp with time zone default now()
);

create index if not exists thesis_documents_user_id_idx on thesis_documents(user_id);

create table if not exists thesis_checklist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null,
  updated_at timestamp with time zone default now()
);

create table if not exists mental_health_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  value int not null,
  logged_at date not null,
  created_at timestamp with time zone default now()
);

create index if not exists mental_health_user_date_idx on mental_health_logs(user_id, logged_at);

create table if not exists phd_bookings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  booking_date date not null,
  booking_time time not null,
  created_at timestamp with time zone default now()
);

create unique index if not exists phd_bookings_unique on phd_bookings(user_id, booking_date, booking_time);

create table if not exists deadline_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  deadline_date date not null,
  recorded_at timestamp with time zone not null,
  created_at timestamp with time zone default now()
);

create unique index if not exists deadline_logs_unique on deadline_logs(user_id, deadline_date);

alter table profiles enable row level security;
alter table user_plans enable row level security;
alter table assessment_results enable row level security;
alter table school_content enable row level security;
alter table school_progress enable row level security;
alter table todos enable row level security;
alter table thesis_documents enable row level security;
alter table thesis_checklist enable row level security;
alter table mental_health_logs enable row level security;
alter table phd_bookings enable row level security;
alter table deadline_logs enable row level security;

drop policy if exists "profiles_user_policy" on profiles;
create policy "profiles_user_policy" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_plans_user_policy" on user_plans;
create policy "user_plans_user_policy" on user_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "assessment_user_policy" on assessment_results;
create policy "assessment_user_policy" on assessment_results
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "school_content_read_policy" on school_content;
create policy "school_content_read_policy" on school_content
  for select using (auth.role() = 'authenticated');

drop policy if exists "school_progress_user_policy" on school_progress;
create policy "school_progress_user_policy" on school_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "todos_user_policy" on todos;
create policy "todos_user_policy" on todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "thesis_docs_user_policy" on thesis_documents;
create policy "thesis_docs_user_policy" on thesis_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "thesis_checklist_user_policy" on thesis_checklist;
create policy "thesis_checklist_user_policy" on thesis_checklist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


drop policy if exists "mental_health_user_policy" on mental_health_logs;
create policy "mental_health_user_policy" on mental_health_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "phd_bookings_user_policy" on phd_bookings;
create policy "phd_bookings_user_policy" on phd_bookings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "deadline_logs_user_policy" on deadline_logs;
create policy "deadline_logs_user_policy" on deadline_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
