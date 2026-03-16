# HypeChain — Discord Proposal Bot

A social coordination tool for Discord. Users propose ideas, others join or leave via a toggle button. Proposals can be forwarded to other channels and stay synchronized across all copies.

---

## Features

| Feature | Description |
|---|---|
| `/propose [text]` | Creates a new proposal embed with Join/Leave and creator buttons |
| Join / Leave toggle | Adds or removes you from participant list, syncs all copies |
| Forward Here *(Creator only)* | Mirrors the proposal to the current channel, keeps it in sync |
| Modify *(Creator only)* | Opens a modal to edit the proposal text and syncs all copies |
| Cancel *(Creator only)* | Deletes the proposal and removes all copies from channels |
| Promotional Messages | Occasionally replies to messages promoting the `/propose` command |
| Supabase persistence | All state survives bot restarts |

---

## Tech Stack

- **Runtime**: Node.js 20+ (ESM)
- **Discord library**: discord.js v14
- **Database**: Supabase (free tier Postgres)
- **Environment**: dotenv

---

## Project Structure

```
HypeChain/
├── scripts/
│   └── register-commands.js   # One-time slash command registration
├── sql/
│   └── schema.sql             # Supabase DB schema (run once in SQL Editor)
├── src/
│   ├── config.js              # Reads and validates env variables
│   ├── commands.js            # Slash command definitions
│   ├── db.js                  # All Supabase queries
│   ├── embed.js               # Discord embed and button builders
│   ├── index.js               # Bot entry point, interaction router
│   └── supabase.js            # Supabase client singleton
├── .env                       # Local secrets — never commit this
├── .env.example               # Template for env variables
├── .gitignore
├── package.json
├── plan.md                    # Full design plan and diagrams
└── README.md
```

---

## Database Schema

Three tables in `public` schema. Run `sql/schema.sql` once in Supabase SQL Editor.

| Table | Purpose |
|---|---|
| `ideas` | One row per proposal: `idea_id`, `creator_id`, `text`, `created_at` |
| `idea_participants` | One row per user per idea. Composite PK `(idea_id, user_id)` enforces toggle uniqueness |
| `idea_messages` | One row per Discord message (origin + forwarded copies). Used for sync-edit loop |

Key constraints:
- `idea_participants` PK prevents duplicate joins.
- `idea_messages` unique index on `(guild_id, channel_id, message_id)` prevents a message mapping to multiple ideas.
- Both child tables cascade-delete when the parent idea is deleted.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

```bash
DISCORD_TOKEN=            # Bot token — Discord Developer Portal → Bot → Reset Token
DISCORD_CLIENT_ID=        # Application ID — Discord Developer Portal → General Information
DISCORD_GUILD_ID=         # Your test server ID — right-click server name → Copy Server ID (requires Developer Mode)
SUPABASE_URL=             # Supabase project URL — Supabase Dashboard → Settings → API
SUPABASE_SERVICE_ROLE_KEY= # service_role key — Supabase Dashboard → Settings → API (keep secret)
```

> **Security**: Never commit `.env`. `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security.
> If either key is exposed publicly, rotate it immediately:
> - Discord token: Developer Portal → Bot → Reset Token
> - Supabase service role: Dashboard → Settings → API → rotate

---

## First-Time Setup

### 1. Supabase Schema
1. Open Supabase dashboard → your project → SQL Editor.
2. Run the full contents of `sql/schema.sql`.
3. Confirm `ideas`, `idea_participants`, `idea_messages` tables exist in Table Editor.

### 2. Discord Bot Invite
1. In Discord Developer Portal → OAuth2 → URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`
2. Open the generated URL in browser.
3. Select your test server and click Authorize.

### 3. Install Dependencies

PowerShell:
```powershell
npm.cmd install
```

Git Bash:
```bash
npm install
```

### 4. Register Slash Commands

PowerShell:
```powershell
npm.cmd run register:commands
```

Git Bash:
```bash
npm run register:commands
```

> This registers `/propose` to the guild in `DISCORD_GUILD_ID`. Guild commands appear within seconds.
> Run this once, or again whenever command definitions change.

### 5. Start Bot

PowerShell:
```powershell
npm.cmd start
```

Git Bash:
```bash
npm start
```

Success output:
```
Logged in as YourBotName#0000
```

---

## Usage

1. In any text channel the bot can access, type `/propose` and enter your idea text.
2. Bot posts an embed with `Join / Leave` and `Forward Here` buttons.
3. Anyone can click `Join / Leave` to toggle their participation.
4. The creator (or anyone) can navigate to another channel and click `Forward Here` to mirror the proposal there.
5. Any join/leave action on any copy updates all linked copies simultaneously.

---

## Edge Cases Handled

| Case | Behaviour |
|---|---|
| Forwarded message deleted | Stale `message_id` is removed from DB and sync continues on remaining copies |
| Bot lacks channel permission | Ephemeral error shown to user; no message posted |
| Double-click / concurrent joins | DB unique constraint on `(idea_id, user_id)` prevents duplicate rows |
| Bot restart mid-update | All state is in Supabase; next interaction re-derives and re-syncs |

---

## Development Notes

- Bot process restart is safe because no in-memory state is used for truth.
- PowerShell on Windows blocks `npm` scripts by default. Use `npm.cmd` as a workaround.
- `DISCORD_GUILD_ID` makes slash commands register instantly (guild-scoped). Remove it to register global commands (takes up to 1 hour to propagate).
- The `Forward Here` button forwards to the channel where the message currently is. A channel picker (select menu) can be added as a future improvement.

---

## Future Improvements

- [ ] Channel select menu for forward target
- [ ] Creator-only restriction on Forward
- [ ] `/close [idea_id]` command to archive proposals
- [ ] `/list` command to show active proposals in server
- [ ] Startup preflight check to verify DB tables exist
- [ ] Logging (pino or winston) for production diagnostics
- [ ] Deploy to Railway / Fly.io / Render for always-on hosting
