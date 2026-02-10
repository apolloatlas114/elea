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

create table if not exists referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists referral_codes_code_idx on referral_codes(code);

create table if not exists referral_attributions (
  id uuid primary key default uuid_generate_v4(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referee_user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null references referral_codes(code),
  status text not null default 'linked',
  source text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint referral_no_self check (referrer_user_id <> referee_user_id),
  constraint referral_attr_status_check check (status in ('linked', 'reserved', 'paid', 'credited', 'invalid'))
);

create index if not exists referral_attr_referrer_idx on referral_attributions(referrer_user_id);
create index if not exists referral_attr_referee_idx on referral_attributions(referee_user_id);

create table if not exists referral_discount_reservations (
  id uuid primary key default uuid_generate_v4(),
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referral_code text not null references referral_codes(code),
  plan text not null,
  list_amount_cents int not null,
  discount_percent int not null default 10,
  discount_cents int not null,
  final_amount_cents int not null,
  referrer_credit_cents int not null,
  status text not null default 'reserved',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint referral_reservation_plan_check check (plan in ('basic', 'pro')),
  constraint referral_reservation_status_check check (status in ('reserved', 'paid', 'cancelled', 'credited')),
  constraint referral_amount_check check (
    list_amount_cents >= 0 and
    discount_cents >= 0 and
    final_amount_cents >= 0 and
    referrer_credit_cents >= 0
  ),
  unique (invitee_user_id, plan)
);

create index if not exists referral_reservation_invitee_idx on referral_discount_reservations(invitee_user_id);
create index if not exists referral_reservation_referrer_idx on referral_discount_reservations(referrer_user_id);

alter table referral_codes enable row level security;
alter table referral_attributions enable row level security;
alter table referral_discount_reservations enable row level security;

drop policy if exists "referral_codes_user_policy" on referral_codes;
create policy "referral_codes_user_policy" on referral_codes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "referral_attributions_select_own" on referral_attributions;
create policy "referral_attributions_select_own" on referral_attributions
  for select using (auth.uid() = referrer_user_id or auth.uid() = referee_user_id);

drop policy if exists "referral_attributions_insert_referee" on referral_attributions;
create policy "referral_attributions_insert_referee" on referral_attributions
  for insert with check (auth.uid() = referee_user_id and auth.uid() <> referrer_user_id);

drop policy if exists "referral_reservations_select_own" on referral_discount_reservations;
create policy "referral_reservations_select_own" on referral_discount_reservations
  for select using (auth.uid() = invitee_user_id or auth.uid() = referrer_user_id);

drop policy if exists "referral_reservations_insert_invitee" on referral_discount_reservations;
create policy "referral_reservations_insert_invitee" on referral_discount_reservations
  for insert with check (auth.uid() = invitee_user_id);

drop policy if exists "referral_reservations_update_invitee" on referral_discount_reservations;
create policy "referral_reservations_update_invitee" on referral_discount_reservations
  for update using (auth.uid() = invitee_user_id) with check (auth.uid() = invitee_user_id);

create or replace function claim_referral(input_code text, input_source text default 'invite_link')
returns table(status text, referrer_user_id uuid, referral_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(input_code, '')));
  v_referrer uuid;
begin
  if v_user_id is null then
    return query select 'unauthenticated'::text, null::uuid, null::text;
    return;
  end if;

  if v_code = '' then
    return query select 'no_code'::text, null::uuid, null::text;
    return;
  end if;

  select rc.user_id into v_referrer
  from referral_codes rc
  where rc.code = v_code
  limit 1;

  if v_referrer is null then
    return query select 'invalid_code'::text, null::uuid, v_code;
    return;
  end if;

  if v_referrer = v_user_id then
    return query select 'self_referral'::text, v_referrer, v_code;
    return;
  end if;

  if exists(select 1 from referral_attributions ra where ra.referee_user_id = v_user_id) then
    return query select 'already_claimed'::text, v_referrer, v_code;
    return;
  end if;

  insert into referral_attributions (
    referrer_user_id,
    referee_user_id,
    referral_code,
    status,
    source,
    updated_at
  )
  values (
    v_referrer,
    v_user_id,
    v_code,
    'linked',
    coalesce(nullif(trim(input_source), ''), 'invite_link'),
    now()
  );

  return query select 'claimed'::text, v_referrer, v_code;
end;
$$;

grant execute on function claim_referral(text, text) to authenticated;

create or replace function reserve_referral_discount(
  input_plan text,
  input_list_amount_cents int,
  input_discount_percent int default 10
)
returns table(
  status text,
  plan text,
  list_amount_cents int,
  discount_percent int,
  discount_cents int,
  final_amount_cents int,
  referrer_credit_cents int,
  referral_code text,
  referrer_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan text := lower(trim(coalesce(input_plan, '')));
  v_amount int := coalesce(input_list_amount_cents, 0);
  v_percent int := greatest(0, least(100, coalesce(input_discount_percent, 10)));
  v_discount int := 0;
  v_final int := 0;
  v_referrer uuid;
  v_code text;
begin
  if v_user_id is null then
    return query select 'unauthenticated'::text, v_plan, v_amount, v_percent, 0, v_amount, 0, null::text, null::uuid;
    return;
  end if;

  if v_plan not in ('basic', 'pro') then
    return query select 'plan_not_eligible'::text, v_plan, v_amount, v_percent, 0, v_amount, 0, null::text, null::uuid;
    return;
  end if;

  if v_amount <= 0 then
    return query select 'invalid_amount'::text, v_plan, v_amount, v_percent, 0, v_amount, 0, null::text, null::uuid;
    return;
  end if;

  select ra.referrer_user_id, ra.referral_code
    into v_referrer, v_code
  from referral_attributions ra
  where ra.referee_user_id = v_user_id
  limit 1;

  if v_referrer is null or v_code is null then
    return query select 'no_referral'::text, v_plan, v_amount, v_percent, 0, v_amount, 0, null::text, null::uuid;
    return;
  end if;

  v_discount := round(v_amount * (v_percent::numeric / 100.0));
  if v_discount < 0 then v_discount := 0; end if;
  if v_discount > v_amount then v_discount := v_amount; end if;
  v_final := v_amount - v_discount;

  insert into referral_discount_reservations (
    invitee_user_id,
    referrer_user_id,
    referral_code,
    plan,
    list_amount_cents,
    discount_percent,
    discount_cents,
    final_amount_cents,
    referrer_credit_cents,
    status,
    updated_at
  )
  values (
    v_user_id,
    v_referrer,
    v_code,
    v_plan,
    v_amount,
    v_percent,
    v_discount,
    v_final,
    v_discount,
    'reserved',
    now()
  )
  on conflict (invitee_user_id, plan)
  do update set
    referrer_user_id = excluded.referrer_user_id,
    referral_code = excluded.referral_code,
    list_amount_cents = excluded.list_amount_cents,
    discount_percent = excluded.discount_percent,
    discount_cents = excluded.discount_cents,
    final_amount_cents = excluded.final_amount_cents,
    referrer_credit_cents = excluded.referrer_credit_cents,
    status = 'reserved',
    updated_at = now();

  update referral_attributions
  set status = case when status = 'linked' then 'reserved' else status end,
      updated_at = now()
  where referee_user_id = v_user_id;

  return query select
    'reserved'::text,
    v_plan,
    v_amount,
    v_percent,
    v_discount,
    v_final,
    v_discount,
    v_code,
    v_referrer;
end;
$$;

grant execute on function reserve_referral_discount(text, int, int) to authenticated;
