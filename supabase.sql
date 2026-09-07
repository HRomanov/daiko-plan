create table if not exists public.plan_state (id text primary key,state jsonb not null default '{"completed":{},"edits":{},"deleted":{},"custom":{}}'::jsonb,updated_at timestamptz not null default now());
alter table public.plan_state enable row level security;
drop policy if exists "authenticated can read plan_state" on public.plan_state;
create policy "authenticated can read plan_state" on public.plan_state for select to authenticated using (true);
drop policy if exists "authenticated can insert plan_state" on public.plan_state;
create policy "authenticated can insert plan_state" on public.plan_state for insert to authenticated with check (true);
drop policy if exists "authenticated can update plan_state" on public.plan_state;
create policy "authenticated can update plan_state" on public.plan_state for update to authenticated using (true) with check (true);
insert into public.plan_state (id,state) values ('daiko-plan-2weeks-2026','{"completed":{},"edits":{},"deleted":{},"custom":{}}'::jsonb) on conflict (id) do nothing;