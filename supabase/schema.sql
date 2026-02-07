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

create table if not exists admin_users (
  email text primary key,
  created_at timestamp with time zone default now()
);

create table if not exists user_activity_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  event_type text not null,
  page_path text,
  referrer text,
  session_id text,
  device_fingerprint text,
  device_type text,
  os_name text,
  browser_name text,
  country text,
  city text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create index if not exists user_activity_created_idx on user_activity_events(created_at desc);
create index if not exists user_activity_user_idx on user_activity_events(user_id);
create index if not exists user_activity_event_idx on user_activity_events(event_type);

create table if not exists security_events (
  id uuid primary key default uuid_generate_v4(),
  severity text not null default 'medium',
  category text not null,
  title text not null,
  user_id uuid references auth.users(id) on delete set null,
  details jsonb default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamp with time zone default now()
);

create index if not exists security_events_created_idx on security_events(created_at desc);
create index if not exists security_events_resolved_idx on security_events(resolved);

create table if not exists finance_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  plan text not null default 'free',
  amount_cents int not null default 0,
  currency text not null default 'EUR',
  status text not null default 'initiated',
  source text not null,
  created_at timestamp with time zone default now()
);

create index if not exists finance_events_created_idx on finance_events(created_at desc);
create index if not exists finance_events_status_idx on finance_events(status);

create table if not exists score_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  document_id text,
  status text not null default 'queued',
  score numeric,
  payload jsonb default '{}'::jsonb,
  assigned_to_email text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists score_jobs_status_idx on score_jobs(status);
create index if not exists score_jobs_updated_idx on score_jobs(updated_at desc);

create table if not exists ops_tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  status text not null default 'todo',
  priority text not null default 'medium',
  assignee_email text,
  related_user_id uuid references auth.users(id) on delete set null,
  related_document_id text,
  due_at timestamp with time zone,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists ops_tasks_status_idx on ops_tasks(status);
create index if not exists ops_tasks_due_idx on ops_tasks(due_at);

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
alter table admin_users enable row level security;
alter table user_activity_events enable row level security;
alter table security_events enable row level security;
alter table finance_events enable row level security;
alter table score_jobs enable row level security;
alter table ops_tasks enable row level security;

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

drop policy if exists "admin_users_self_select" on admin_users;
create policy "admin_users_self_select" on admin_users
  for select using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "user_activity_insert_authenticated" on user_activity_events;
create policy "user_activity_insert_authenticated" on user_activity_events
  for insert with check (auth.role() = 'authenticated' and (user_id is null or auth.uid() = user_id));

drop policy if exists "user_activity_select_admin" on user_activity_events;
create policy "user_activity_select_admin" on user_activity_events
  for select using (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "security_events_insert_authenticated" on security_events;
create policy "security_events_insert_authenticated" on security_events
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "security_events_select_admin" on security_events;
create policy "security_events_select_admin" on security_events
  for select using (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "finance_events_insert_authenticated" on finance_events;
create policy "finance_events_insert_authenticated" on finance_events
  for insert with check (auth.role() = 'authenticated' and (user_id is null or auth.uid() = user_id));

drop policy if exists "finance_events_select_admin" on finance_events;
create policy "finance_events_select_admin" on finance_events
  for select using (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "score_jobs_admin_all" on score_jobs;
create policy "score_jobs_admin_all" on score_jobs
  for all using (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  ) with check (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "ops_tasks_admin_all" on ops_tasks;
create policy "ops_tasks_admin_all" on ops_tasks
  for all using (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  ) with check (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "profiles_admin_read_policy" on profiles;
create policy "profiles_admin_read_policy" on profiles
  for select using (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "user_plans_admin_read_policy" on user_plans;
create policy "user_plans_admin_read_policy" on user_plans
  for select using (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "todos_admin_read_policy" on todos;
create policy "todos_admin_read_policy" on todos
  for select using (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "thesis_docs_admin_read_policy" on thesis_documents;
create policy "thesis_docs_admin_read_policy" on thesis_documents
  for select using (
    exists (
      select 1 from admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
