create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  created_at timestamp with time zone default now()
);

create table if not exists profiles (
  id uuid primary key references users(id) on delete cascade,
  studiengang text not null,
  hochschule text,
  abgabedatum date not null,
  status int not null default 0,
  zielnote text not null,
  created_at timestamp with time zone default now()
);

create table if not exists deadlines (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  due_date date not null,
  created_at timestamp with time zone default now()
);

create table if not exists progress (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  video_progress int not null default 0,
  checklist_progress int not null default 0,
  uploads_progress int not null default 0,
  coaching_progress int not null default 0,
  updated_at timestamp with time zone default now()
);

create table if not exists stress_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  value int not null,
  logged_at date not null,
  created_at timestamp with time zone default now()
);

create table if not exists purchases (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  plan text not null,
  amount_cents int not null,
  provider text not null,
  status text not null,
  created_at timestamp with time zone default now()
);

create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  scheduled_at timestamp with time zone not null,
  duration_minutes int not null,
  status text not null,
  created_at timestamp with time zone default now()
);

create table if not exists scores (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  quality_score int not null,
  methodik int not null,
  logik int not null,
  sprache int not null,
  daten int not null,
  created_at timestamp with time zone default now()
);

create table if not exists tickets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  details text,
  status text not null default 'open',
  created_at timestamp with time zone default now()
);
