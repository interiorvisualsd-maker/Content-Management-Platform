# Content Management Platform

Internal admin platform for managing articles and publishing AI-assisted content to Supabase.

**Pipeline:** Draft → Generate Audio (TTS) → Generate Transcription (Whisper) → LLM-Correct Transcription → Approve → Publish to Supabase.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Server components + API routes in one codebase |
| Database & Storage | Supabase (Postgres + Storage) | Managed Postgres with RLS, public bucket for audio |
| Auth | Hardcoded env-var credentials + signed JWT cookie (`jose`) | Per spec — simple, no auth provider needed |
| Text-to-Speech | Microsoft Edge TTS (`msedge-tts`) | **$0, no API key**, neural voices, MP3 output |
| Transcription | Groq Whisper `whisper-large-v3` | **Free tier**, returns segments with timestamps |
| LLM correction | Groq Llama 3.3 70B (`llama-3.3-70b-versatile`) | **Free tier**, fast, JSON mode, OpenAI-compatible |
| Styling | TailwindCSS 3 | Utility-first, no extra UI deps |

> The architecture is **provider-agnostic**. Each AI step is isolated in its own API route (`/api/tts`, `/api/transcribe`, `/api/correct`). Swap any provider by editing one file — no UI changes required.

## Quick start

### 1. Clone & install

```bash
git clone <your-repo-url>
cd content-management-platform
npm install
```

### 2. Create accounts & grab keys

You need **two free accounts** (~10 minutes):

| Account | Where | What you get |
|---|---|---|
| **Supabase** | https://supabase.com → New Project | `Project URL`, `anon key`, `service_role key` |
| **Groq** | https://console.groq.com → API Keys | `gsk_...` API key (covers both Whisper + Llama) |

**Edge TTS needs no account or key.**

### 3. Set up Supabase schema

1. In Supabase Dashboard → **SQL Editor** → New query
2. Paste the contents of [`supabase/schema.sql`](./supabase/schema.sql)
3. Click **Run** — this creates:
   - The `articles` table with the status enum
   - RLS policies (open for the demo — tighten in production)
   - A public Storage bucket called `audio-files`
   - One seed article so the dashboard isn't empty

### 4. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
cp .env.local.example .env.local
```

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...your-service-role-key...
SUPABASE_STORAGE_BUCKET=audio-files

# Groq (covers Whisper + Llama 3.3)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Admin auth (you pick these)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-to-a-strong-password

# App URL (your Vercel URL in production)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run it

```bash
npm run dev
```

Open http://localhost:3000 → you'll be redirected to `/login`. Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (browser + server CRUD) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role (bypasses RLS, used for Storage uploads) |
| `SUPABASE_STORAGE_BUCKET` | ⚠️ | Storage bucket name (defaults to `audio-files`) |
| `GROQ_API_KEY` | ✅ | Groq API key — used for Whisper transcription AND Llama correction |
| `ADMIN_EMAIL` | ✅ | Login email (you pick this) |
| `ADMIN_PASSWORD` | ✅ | Login password (you pick this; also used as the JWT signing secret) |
| `NEXT_PUBLIC_APP_URL` | ⚠️ | App's public URL — used for canonical links (defaults to `http://localhost:3000`) |

## How the pipeline works

Each step is a single API route. State lives in the `articles` table.

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌───────────┐
│   Draft     │ ──▶ │ Generate TTS │ ──▶ │ Generate         │ ──▶ │ LLM Correct      │ ──▶ │ Approve   │
│             │     │ /api/tts     │     │ Transcription    │     │ /api/correct     │     │ & Publish │
│             │     │ Edge TTS →   │     │ /api/transcribe  │     │ Groq Llama 3.3   │     │ /api/     │
│             │     │ Storage      │     │ Groq Whisper     │     │ preserves segs   │     │ publish   │
└─────────────┘     └──────────────┘     └──────────────────┘     └──────────────────┘     └───────────┘
```

**Statuses:** `draft` → `audio_generated` → `transcription_generated` → `llm_corrected` → `approved` → `published`. Any step can fail and set `status=failed` with `error_message` and `failed_step` populated — the UI shows a retry button.

## Article detail page

The article detail page (`/articles/[id]`) is the control center. It lets the admin:

- Edit title + content + transcription + corrected transcription
- Generate audio (Edge TTS) — playable inline via `<audio>`
- Generate transcription (Groq Whisper) — shown as timestamped segments
- Run LLM correction (Groq Llama 3.3) — preserves segment timestamps
- Manually edit either transcription as raw JSON
- Approve and publish once all steps are complete

## API routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/login` | Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` → sets session cookie |
| `POST` | `/api/logout` | Clear session cookie |
| `POST` | `/api/articles` | Create new article (draft) |
| `GET` | `/api/articles/:id` | Fetch article (used by detail page refresh) |
| `PATCH` | `/api/articles/:id` | Update editable fields (title, content, transcription, corrected_transcription, …) |
| `POST` | `/api/tts` | Generate audio with Edge TTS, upload to Supabase Storage |
| `POST` | `/api/transcribe` | Send audio to Groq Whisper, store transcription with segments |
| `POST` | `/api/correct` | Send article content + transcription to Groq Llama 3.3, store corrected transcription |
| `POST` | `/api/publish` | Validate pipeline completion, set status to approved/published |

## Authentication

Simple and per-spec:

1. Admin enters email + password on `/login`
2. Server compares against `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars
3. On success, server signs a JWT (HS256, secret = `ADMIN_PASSWORD`) and sets it as an `httpOnly` cookie called `admin_session`, valid for 7 days
4. Next.js middleware (`src/middleware.ts`) checks the cookie on every request and redirects unauthenticated users to `/login` (or returns 401 JSON for API routes)

## Project structure

```
content-management-platform/
├── supabase/
│   └── schema.sql              # Run this in Supabase SQL Editor
├── src/
│   ├── middleware.ts            # Auth gate (Edge runtime)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Redirects to /dashboard
│   │   ├── globals.css
│   │   ├── login/page.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx         # Article list with filters + search + summary
│   │   │   └── actions.ts       # logout server action
│   │   ├── articles/
│   │   │   ├── new/page.tsx     # Create-article form
│   │   │   └── [id]/
│   │   │       ├── page.tsx              # Server component (fetches article)
│   │   │       └── ArticleDetailClient.tsx # Client UI for the full pipeline
│   │   └── api/
│   │       ├── login/route.ts
│   │       ├── logout/route.ts
│   │       ├── articles/
│   │       │   ├── route.ts     # POST create
│   │       │   └── [id]/route.ts # GET + PATCH
│   │       ├── tts/route.ts
│   │       ├── transcribe/route.ts
│   │       ├── correct/route.ts
│   │       └── publish/route.ts
│   ├── lib/
│   │   ├── auth.ts              # JWT sign/verify
│   │   ├── status.ts            # Status constants + labels + colors
│   │   ├── types.ts             # Article, TranscriptionPayload types
│   │   └── supabase/
│   │       ├── client.ts        # Browser client (anon key)
│   │       ├── server.ts        # Server client (anon key)
│   │       └── admin.ts         # Server client (service role, bypasses RLS)
│   └── components/
│       ├── StatusBadge.tsx
│       └── AudioPlayer.tsx
├── .env.local.example
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## Deploy to Vercel

### Step-by-step

1. **Push to GitHub** (already done if you cloned from your repo).

2. **Import to Vercel:**
   - Go to https://vercel.com/new
   - Select your GitHub repo
   - Framework preset: **Next.js** (auto-detected)
   - Root directory: `./` (default)
   - Build command: `npm run build` (default)
   - Click **Deploy**

3. **Set environment variables** (Project Settings → Environment Variables):
   - Add every variable from `.env.local.example` with your real values
   - Set `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://your-app.vercel.app`)
   - Click **Save**

4. **Redeploy** (Deployments → ⋯ → Redeploy) so the new env vars take effect.

5. **Update Supabase URL allow-list:**
   - Supabase Dashboard → Authentication → URL Configuration
   - Add your Vercel URL to "Site URL" and "Redirect URLs" (not strictly required for this app, but good practice)

### Vercel function timeouts

The default Hobby tier timeout is 60 seconds, which is enough for:
- Edge TTS: ~5-15s for a 1500-word article
- Groq Whisper: ~5-10s for a 5-minute audio
- Groq Llama 3.3: ~3-8s for segment correction

If you upgrade to Pro, set `maxDuration` higher in `src/app/api/*/route.ts` for longer articles.

## Free tier limits (as of 2025)

| Service | Free tier | Enough for? |
|---|---|---|
| Supabase | 500MB DB, 1GB Storage, 50k MAU | ~10,000 articles |
| Groq Whisper | ~7,000 min/month | ~1,400 5-min audios |
| Groq Llama 3.3 70B | 30 req/min, 14,400 req/day | Heavy daily admin use |
| Edge TTS | Unlimited (no auth) | Unlimited |
| Vercel Hobby | 100GB bandwidth, 60s function timeout | Demo + low-traffic internal use |

## Troubleshooting

**"Failed to download audio" during transcription** — Check that your Storage bucket is public and the `audio-files` bucket exists. Re-run `supabase/schema.sql` if needed.

**"Edge TTS returned no audio"** — Edge TTS uses a public WebSocket endpoint that occasionally rate-limits. Wait 30s and click Regenerate.

**"Groq Whisper API error (401)"** — Your `GROQ_API_KEY` is missing or invalid. Regenerate at https://console.groq.com/keys.

**"Cannot publish: missing …"** — Walk through the pipeline: Generate Audio → Generate Transcription → Run LLM Correction → then Approve & Publish.

**Cookie not persisting on Vercel** — Make sure `NEXT_PUBLIC_APP_URL` is set to your production URL with `https://`, and that `secure: true` is set in production (the code already does this via `process.env.NODE_ENV === "production"`).

## License

Internal tool — all rights reserved.
