# Smart Notebook

A personal AI-powered journaling app with a warm, cozy aesthetic. The LLM reads your writing silently, organizes everything in a database, and can render inline UI components. You never manage structure — the AI handles it all.

## Live Preview

**Password**: Set via `AUTH_PASSWORD` in `.env.local`

## Features

### Writing Experience
- Chat-style stream: your messages right-aligned, AI left-aligned
- Two AI message types:
  - **Conversational**: Full warm chat bubbles for direct engagement
  - **Annotation**: Margin-note style with accent border for observations
- Auto-trigger: AI processes silently after sentence-ending pause (2.5s) or idle (6s)
- Manual trigger: Ctrl+Enter or Shift+Enter always produces a conversational reply
- Continuation detection: AI recognizes when you're continuing a previous entry and loads history

### AI Intelligence (GPT-4o)
- Generates meaningful entry titles (not just first few words)
- Auto-creates and organizes folders
- Tags emotions and topics
- Maintains a rolling context memo across sessions
- Context-aware greetings based on time of day, recent entries, and emotional state

### Inline Tools
The AI can render these directly in the chat stream:
- Charts (line/bar/pie via Chart.js)
- Tables
- Interactive checklists (toggleable, persisted)
- Prompt cards (journaling prompts)
- Trackers (metric widgets)
- Link cards (references to past entries)
- Calendar views

### Browse Panel
- Near-invisible top-right icon opens side panel
- Entries organized by AI-generated folders
- Emotion and topic tags visible
- Click to load and continue any past entry
- "New entry" button to start fresh

### Design
- Warm typography: Source Serif 4 + DM Sans
- Soft cream/warm background
- 680px content column
- Dark mode (auto-detects system preference)
- Mobile-first, responsive to all screen sizes
- Calm micro-animations
- No external icon dependencies (inline SVGs)

## Tech Stack

- **Frontend**: Next.js 16 + React 19 (single-page client component)
- **Backend**: Next.js API Routes (server-side only)
- **AI**: OpenAI GPT-4o with structured JSON responses
- **Database**: Supabase (PostgreSQL)
- **Auth**: Simple password-based login with httpOnly cookie
- **Styling**: CSS custom properties, no Tailwind dependency

## Data Model

| Table | Purpose |
|-------|---------|
| `entries` | Journal entries with title, folder, emotion/topic tags |
| `messages` | User and AI messages with position ordering |
| `folders` | AI-generated folders for organization |
| `context_memo` | Rolling summary of user's state across sessions |
| `tool_outputs` | Stored tool call data (charts, checklists, etc.) |

## Deployment on Vercel

### 1. Push to GitHub
```bash
git remote add origin https://github.com/YOUR_USER/smart-notebook.git
git push -u origin main
```

### 2. Import in Vercel
- Go to [vercel.com/new](https://vercel.com/new)
- Import your GitHub repo
- Framework: Next.js (auto-detected)

### 3. Set Environment Variables in Vercel
Add these in Vercel → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key |
| `OPENAI_API_KEY` | Your OpenAI API key (sk-...) |
| `AUTH_PASSWORD` | A strong password for login |

### 4. Deploy
Vercel auto-deploys on push. Your app will be live at `https://your-project.vercel.app`.

## Supabase Setup

Run this SQL in Supabase → SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  parent_folder_id UUID REFERENCES folders(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT DEFAULT 'Untitled',
  folder_id UUID REFERENCES folders(id),
  emotion_tags TEXT[] DEFAULT '{}',
  topic_tags TEXT[] DEFAULT '{}',
  context_memo_snapshot TEXT DEFAULT ''
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('user_message', 'conversational', 'annotation')),
  tone TEXT,
  linked_entry_id UUID REFERENCES entries(id),
  tool_call JSONB,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE context_memo (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  summary_text TEXT DEFAULT '',
  key_facts JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tool_outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tool_type TEXT NOT NULL,
  tool_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO context_memo (id, summary_text, key_facts)
VALUES ('singleton', '', '{}')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX idx_messages_entry_id ON messages(entry_id);
CREATE INDEX idx_messages_position ON messages(entry_id, position);
CREATE INDEX idx_entries_folder_id ON entries(folder_id);
CREATE INDEX idx_entries_updated_at ON entries(updated_at DESC);
CREATE INDEX idx_entries_created_at ON entries(created_at DESC);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_memo ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON folders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON context_memo FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON tool_outputs FOR ALL USING (true) WITH CHECK (true);
```

## Security Notes

- OpenAI API key is **server-side only** — never exposed to the browser
- Supabase service_role key is **server-side only**
- Auth uses httpOnly secure cookies
- All API routes validate auth before processing
- RLS enabled on all tables with service_role bypass

## Local Development

```bash
# Install dependencies
npm install

# Create .env.local with your keys (see above)

# Build and run
npm run build
npm start
```
