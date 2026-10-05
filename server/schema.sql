-- Additive tables: existing resume.ai records are not modified.
-- Run with a privileged database connection. The API must use a server-only
-- credential; browser/public/anonymous roles must have no access to these tables.
create table if not exists startup_accounts (id uuid primary key, payload jsonb not null, created_at timestamptz not null default now());
create unique index if not exists startup_account_email on startup_accounts ((payload->>'email'));
create table if not exists startup_sessions (id uuid primary key, payload jsonb not null, created_at timestamptz not null default now());
create table if not exists startup_resumes (id uuid primary key, payload jsonb not null, created_at timestamptz not null default now());
create table if not exists startup_applications (id uuid primary key, payload jsonb not null, created_at timestamptz not null default now());
create table if not exists startup_leads (id uuid primary key, payload jsonb not null, created_at timestamptz not null default now());
create unique index if not exists startup_lead_email on startup_leads ((payload->>'email'));
create unique index if not exists startup_application_identity on startup_applications ((payload->>'user_id'), (payload->>'job_id'));
create index if not exists startup_session_owner on startup_sessions ((payload->>'user_id'));
create index if not exists startup_resume_owner on startup_resumes ((payload->>'user_id'));
create index if not exists startup_application_owner on startup_applications ((payload->>'user_id'));
alter table startup_accounts enable row level security;
alter table startup_sessions enable row level security;
alter table startup_resumes enable row level security;
alter table startup_applications enable row level security;
alter table startup_leads enable row level security;
-- No public policies are created. Only a trusted server credential can access
-- these tables. Do not expose that credential as a VITE_ environment variable.
