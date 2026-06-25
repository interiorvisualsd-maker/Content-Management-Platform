-- ============================================================
-- Content Management Platform — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Articles table — single source of truth for the whole pipeline
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content text not null,
  level text,
  category text,
  language text default 'en',
  status text not null default 'draft'
    check (status in (
      'draft',
      'audio_generated',
      'transcription_generated',
      'llm_corrected',
      'ready_for_review',
      'approved',
      'published',
      'failed'
    )),
  audio_url text,
  audio_storage_path text,
  transcription jsonb,
  corrected_transcription jsonb,
  error_message text,
  failed_step text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  published_at timestamptz
);

-- Index for dashboard filtering/search
create index if not exists idx_articles_status on public.articles(status);
create index if not exists idx_articles_created_at on public.articles(created_at desc);
create index if not exists idx_articles_slug on public.articles(slug);

-- Auto-update updated_at on row change
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_articles_updated_at on public.articles;
create trigger trg_articles_updated_at
  before update on public.articles
  for each row execute function public.handle_updated_at();

-- ============================================================
-- Row Level Security
-- For this internal admin tool we allow anon access (the app
-- enforces auth via env-var credentials). Tighten this in
-- production if needed by adding a service-role-only policy.
-- ============================================================
alter table public.articles enable row level security;

drop policy if exists "Public read access" on public.articles;
create policy "Public read access"
  on public.articles for select
  using (true);

drop policy if exists "Public insert access" on public.articles;
create policy "Public insert access"
  on public.articles for insert
  with check (true);

drop policy if exists "Public update access" on public.articles;
create policy "Public update access"
  on public.articles for update
  using (true);

drop policy if exists "Public delete access" on public.articles;
create policy "Public delete access"
  on public.articles for delete
  using (true);

-- ============================================================
-- Storage bucket — create via Dashboard OR run this:
-- ============================================================
insert into storage.buckets (id, name, public)
values ('audio-files', 'audio-files', true)
on conflict (id) do nothing;

-- Storage policies (public read, public write — tighten in prod)
drop policy if exists "Public read audio files" on storage.objects;
create policy "Public read audio files"
  on storage.objects for select
  using (bucket_id = 'audio-files');

drop policy if exists "Public upload audio files" on storage.objects;
create policy "Public upload audio files"
  on storage.objects for insert
  with check (bucket_id = 'audio-files');

-- ============================================================
-- Seed: one sample article so the dashboard isn't empty
-- ============================================================
insert into public.articles (title, slug, excerpt, content, level, category, language, status)
values (
  'Understanding Neural Networks: A Beginner''s Guide',
  'understanding-neural-networks-beginners-guide',
  'A friendly introduction to how neural networks learn from data.',
  'Neural networks are a type of machine learning model inspired by the human brain. They consist of layers of interconnected nodes, each performing simple mathematical operations. When you train a neural network, you adjust the weights of these connections so that the network produces the correct output for a given input. The most common type of neural network is called a feedforward network, where information flows in one direction from input to output. Deep learning refers to networks with many layers, which can learn increasingly abstract representations of data. For example, the first layer might detect edges in an image, the second might detect shapes, and deeper layers might recognize objects like faces or cars. Training a neural network requires three things: a dataset, a loss function, and an optimizer. The dataset provides examples to learn from. The loss function measures how far the network''s predictions are from the correct answers. The optimizer adjusts the network''s weights to reduce the loss. This process is repeated many times until the network performs well. One of the most popular optimization algorithms is called stochastic gradient descent, or SGD for short. It works by computing the gradient of the loss with respect to each weight and taking a small step in the opposite direction. Modern variants like Adam and RMSProp make this process faster and more reliable. Neural networks have revolutionized fields like computer vision, natural language processing, and speech recognition. They power everything from smartphone cameras to language models like the one you are reading right now.',
  'beginner',
  'machine-learning',
  'en',
  'draft'
)
on conflict (slug) do nothing;
