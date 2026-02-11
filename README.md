# Smart Notebook

A personal AI-powered journaling app with a warm, cozy aesthetic. The LLM reads your writing silently, organizes everything in a database, and can render inline UI components. You never manage structure — the AI handles it all.

## Live Preview

**Password**: Set via `AUTH_PASSWORD` in `.env.local`

## Features

### Writing Experience
- Chat-style stream: your messages right-aligned, AI left-aligned
- **Editable writing blocks**: go back and edit any text you've written, even after the AI has responded
- Two AI message types:
  - **Annotation** (preferred): Margin-note style with accent border for observations — the AI's default response type
  - **Conversational**: Full warm chat bubbles for direct engagement
- Auto-trigger: AI processes silently after sentence-ending pause (5s+)
- Manual trigger: Ctrl+Enter or Shift+Enter always produces a conversational reply
- Continuation detection: AI recognizes when you're continuing a previous entry and loads history

### Conversation Import
- Import conversations from Genspark shared links
- Paste a public conversation URL → preview messages → import as a notebook entry
- Imported conversations appear as full entries with user/AI message threading
- Access via the import button (↓) in the top bar

### Image Support
- **Paste images** from clipboard directly into the notebook
- **Drag & drop** image files onto the writing area
- **Resize** images by dragging the right edge handle
- **Float positioning**: left, center, or right — text wraps around floated images
- **Controls overlay** on hover: float left/center/right and delete

### AI Intelligence (GPT-4o / Claude)
- Multiple model support: Claude Haiku 4.5, Sonnet 4.5, GPT-5 Mini, GPT-5.2
- Strongly prefers **annotation** (margin note) responses over conversational — feels like marginalia, not a chatbot
- Generates meaningful entry titles
- Auto-creates and organizes folders
- Tags emotions and topics
- Maintains a rolling context memo across sessions
- Context-aware greetings based on time of day, recent entries, and emotional state

### Non-Blocking AI Processing
- **Textarea never freezes** — keep writing while the AI processes
- **Processing line indicator** — elegant animated line under the text the AI is working on
- **Separator line** — draws in smoothly between your text and the AI's response
- **Insert animation** — AI response box grows and reveals with smooth height animation
- **Edit-after-response**: Edit your text after AI has responded → a "Reprocess" button appears on the AI response
- **Redo capability**: Click "Reprocess" to have the AI re-analyze your edited text

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
- Calm micro-animations — no jerky transitions
- No external icon dependencies (inline SVGs)

## Tech Stack

- **Frontend**: Next.js 16 + React 19 (single-page client component)
- **Backend**: Next.js API Routes (server-side only)
- **AI**: Multi-model support (OpenAI GPT, Anthropic Claude)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Simple password-based login with httpOnly cookie
- **Styling**: CSS custom properties, no Tailwind dependency

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth` | POST | Login with password |
| `/api/init` | GET | Get greeting, recent entries, context |
| `/api/message` | POST | Send text to AI, get response |
| `/api/entries` | GET | List all entries |
| `/api/entries/[id]` | GET/DELETE | Get or delete specific entry |
| `/api/continuation` | POST | Check if text continues an existing entry |
| `/api/models` | GET | List available AI models |
| `/api/import/preview` | POST | Preview a Genspark conversation for import |
| `/api/import/save` | POST | Save imported conversation as an entry |
| `/api/upload` | POST | Upload an image (base64 → Supabase storage or inline) |
| `/api/checklist` | POST | Toggle a checklist item |

## Data Model

| Table | Purpose |
|-------|---------|
| `entries` | Journal entries with title, folder, emotion/topic tags |
| `messages` | User and AI messages with position ordering |
| `folders` | AI-generated folders for organization |
| `context_memo` | Rolling summary of user's state across sessions |
| `tool_outputs` | Stored tool call data (charts, checklists, etc.) |

## Local Development

```bash
# Install dependencies
npm install

# Create .env.local with your keys
# SUPABASE_URL=...
# SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
# OPENAI_API_KEY=...
# ANTHROPIC_API_KEY=...
# AUTH_PASSWORD=...

# Build and run
npm run build
npm start
```

## Deployment on Vercel

1. Push to GitHub
2. Import in Vercel → Settings → Environment Variables
3. Deploy (auto on push)

## Security Notes

- API keys are **server-side only** — never exposed to the browser
- Auth uses httpOnly secure cookies
- All API routes validate auth before processing
- RLS enabled on all tables with service_role bypass
