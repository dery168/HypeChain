# Project Plan: The Hype Chain (Discord Mini App)

## 1. Overview
A social coordination tool for Discord. Users propose ideas, others join/leave via a toggle button. The proposal can be "Forwarded" to other channels while staying synchronized.

## 2. Core Features
- Command: /propose [text]
- UI: Rich Embed with a 'Join' button.
- Logic: Toggle Join (If user is on list, remove them. If not, add them).
- Sync: If forwarded, all versions of the message update at once.

## 3. Technical Logic
- Store IdeaID, CreatorID, and an Array of ParticipantIDs.
- Use discord.js Message Components (Buttons).
- Keep a list of MessageIDs for each IdeaID to handle the sync-edit.
- Persist all idea state in a database so restarts do not lose participant/message sync data.

## 3.1 Free Database Solution (Recommended)
- Use Supabase Postgres (free tier) as the persistent store.
- Why: free, managed Postgres, good Node.js support, easy local-to-cloud path.
- Store:
	- `ideas` table: `idea_id`, `creator_id`, `text`, `created_at`
	- `idea_participants` table: `idea_id`, `user_id` (unique pair for toggle)
	- `idea_messages` table: `idea_id`, `guild_id`, `channel_id`, `message_id`
- Result: bot restarts are safe because state is reloaded from Postgres.

## 4. Implementation Steps
1. Setup discord.js client and slash command handling.
2. Create the /propose command to send the initial Embed.
3. Connect Supabase Postgres and create the 3 tables.
4. Handle 'interactionCreate' for the Button click (Toggle logic + DB write).
5. Implement the 'Forward' button with a Channel Select menu.
6. On each update, fetch related message IDs from DB and sync-edit all forwarded messages.

## 5. Main User Case Flow Diagrams

### UC1: Create Proposal (/propose)
```mermaid
flowchart TD
	A[User sends /propose text] --> B[Bot validates input]
	B --> C[Create IdeaID]
	C --> D[Insert row in ideas table]
	D --> E[Send embed with Join and Forward buttons]
	E --> F[Insert origin message in idea_messages]
	F --> G[User sees proposal message]
```

### UC2: Join or Leave Proposal (Toggle)
```mermaid
flowchart TD
	A[User clicks Join button] --> B[Bot reads idea_id from button payload]
	B --> C{User already in idea_participants?}
	C -->|Yes| D[Delete user row from idea_participants]
	C -->|No| E[Insert user row into idea_participants]
	D --> F[Load updated participant list]
	E --> F[Load updated participant list]
	F --> G[Load all message_ids for idea_id]
	G --> H[Edit embed on all related messages]
	H --> I[User sees synced member list]
```

### UC3: Forward Proposal to Another Channel
```mermaid
flowchart TD
	A[Creator clicks Forward] --> B[Bot shows Channel Select menu]
	B --> C[Creator selects target channel]
	C --> D[Bot posts mirrored embed in target channel]
	D --> E[Insert new message_id into idea_messages]
	E --> F[All copies now linked to same idea_id]
	F --> G[Future join or leave updates all copies]
```

### UC4: Bot Restart and Recovery
```mermaid
flowchart TD
	A[Bot process restarts] --> B[Reconnect to Discord gateway]
	B --> C[Reconnect to Supabase Postgres]
	C --> D[No in-memory state required for truth]
	D --> E[Next interaction arrives]
	E --> F[Read participants and message_ids from DB]
	F --> G[Process action and write DB changes]
	G --> H[Sync-edit all related messages]
	H --> I[Flow continues without data loss]
```

### UC5: End-to-End Sequence (User, Discord, Bot, DB)
```mermaid
sequenceDiagram
	autonumber
	actor U as User
	participant D as Discord API
	participant B as Hype Chain Bot
	participant S as Supabase Postgres

	U->>D: /propose "Movie night"
	D->>B: Slash command interaction
	B->>S: INSERT into ideas
	S-->>B: idea_id
	B->>D: Send embed (Join, Forward)
	D-->>U: Proposal message visible
	B->>S: INSERT origin message_id into idea_messages

	U->>D: Click Join
	D->>B: Button interaction (idea_id, user_id)
	B->>S: UPSERT/DELETE participant (toggle)
	B->>S: SELECT participants + message_ids
	S-->>B: Updated participants and linked messages
	B->>D: Edit all linked embeds
	D-->>U: All copies show synced participant list

	U->>D: Click Forward and pick channel
	D->>B: Forward interaction (idea_id, channel_id)
	B->>D: Post mirrored message in target channel
	D-->>B: New message_id
	B->>S: INSERT new message_id into idea_messages

	Note over B,S: On restart, bot reads/writes state from DB
``` 

## 6. Edge Cases

### EC1: A Forwarded Message Was Deleted
- Problem: `idea_messages` still contains a `message_id` that no longer exists.
- Handling: when sync-edit fails with Not Found, remove that `message_id` from DB and continue updating the rest.

```mermaid
flowchart TD
	A[Bot sync-edits all message_ids] --> B{Edit succeeded?}
	B -->|Yes| C[Keep message_id]
	B -->|No: Not Found| D[Delete stale message_id from idea_messages]
	D --> E[Continue loop]
	C --> E[Continue loop]
```

### EC2: Missing Permission in Target Channel
- Problem: bot cannot send or edit messages in selected channel.
- Handling: reject forward action for that channel and send an ephemeral error to the user.

```mermaid
flowchart TD
	A[User selects target channel] --> B[Bot checks send and embed permissions]
	B --> C{Permissions valid?}
	C -->|Yes| D[Post mirrored message and save message_id]
	C -->|No| E[Reply ephemeral: missing permissions]
```

### EC3: Double Click or Concurrent Joins
- Problem: two join/leave actions can overlap and cause inconsistent participant state.
- Handling: enforce DB uniqueness on `(idea_id, user_id)` and use transaction-safe toggle logic.

```mermaid
flowchart TD
	A[Two toggle requests arrive close together] --> B[Start DB transaction]
	B --> C{Row exists for idea_id + user_id?}
	C -->|Yes| D[Delete row]
	C -->|No| E[Insert row with unique constraint]
	D --> F[Commit transaction]
	E --> F[Commit transaction]
	F --> G[Fetch final participant list and sync-edit]
```

### EC4: Bot Restarts Mid-Update
- Problem: process stops while editing some forwarded messages.
- Handling: on next interaction, derive state from DB and re-run sync across all current `message_id` rows.

```mermaid
flowchart TD
	A[Bot restarts during update] --> B[Some messages may be stale]
	B --> C[Next interaction triggers normal toggle or forward path]
	C --> D[Bot loads full participant list and message_ids from DB]
	D --> E[Bot re-applies sync-edit to all messages]
	E --> F[All copies converge to same state]
```

## 7. DB Schema (SQL)

Use this in Supabase SQL Editor.

```sql
-- 1) Ideas
create table if not exists public.ideas (
	idea_id uuid primary key default gen_random_uuid(),
	creator_id text not null,
	text text not null,
	created_at timestamptz not null default now()
);

-- 2) Participants (toggle join/leave)
create table if not exists public.idea_participants (
	idea_id uuid not null references public.ideas(idea_id) on delete cascade,
	user_id text not null,
	joined_at timestamptz not null default now(),
	primary key (idea_id, user_id)
);

-- 3) Message links (origin + forwarded copies)
create table if not exists public.idea_messages (
	idea_id uuid not null references public.ideas(idea_id) on delete cascade,
	guild_id text not null,
	channel_id text not null,
	message_id text not null,
	created_at timestamptz not null default now(),
	primary key (idea_id, message_id)
);

-- Optional safety: same Discord message should not map to multiple ideas.
create unique index if not exists ux_idea_messages_global_message
	on public.idea_messages (guild_id, channel_id, message_id);

-- Query performance indexes
create index if not exists ix_participants_idea
	on public.idea_participants (idea_id);

create index if not exists ix_messages_idea
	on public.idea_messages (idea_id);
```

### 7.1 Toggle Pattern (Transaction-Safe)

```sql
-- Pseudocode transaction logic (run from bot):
-- begin;
--   if exists(select 1 from idea_participants where idea_id = $1 and user_id = $2)
--     delete from idea_participants where idea_id = $1 and user_id = $2;
--   else
--     insert into idea_participants (idea_id, user_id) values ($1, $2)
--     on conflict (idea_id, user_id) do nothing;
-- commit;
```

## 8. Minimal Supabase + discord.js Snippets

### 8.1 Environment Variables

```bash
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_app_client_id
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 8.2 Supabase Client Setup

```js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
	{ auth: { persistSession: false } }
);
```

### 8.3 Create Proposal (/propose)

```js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { supabase } from './supabase.js';

export async function handlePropose(interaction) {
	const text = interaction.options.getString('text', true).trim();

	const { data: idea, error } = await supabase
		.from('ideas')
		.insert({ creator_id: interaction.user.id, text })
		.select('idea_id, text')
		.single();

	if (error) throw error;

	const embed = new EmbedBuilder()
		.setTitle('Hype Chain Proposal')
		.setDescription(idea.text)
		.addFields({ name: 'Participants', value: 'No one yet' });

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`join:${idea.idea_id}`)
			.setLabel('Join')
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId(`forward:${idea.idea_id}`)
			.setLabel('Forward')
			.setStyle(ButtonStyle.Primary)
	);

	await interaction.reply({ embeds: [embed], components: [row] });
	const message = await interaction.fetchReply();

	await supabase.from('idea_messages').insert({
		idea_id: idea.idea_id,
		guild_id: interaction.guildId,
		channel_id: interaction.channelId,
		message_id: message.id
	});
}
```

### 8.4 Toggle Join/Leave and Sync

```js
import { EmbedBuilder } from 'discord.js';
import { supabase } from './supabase.js';

function parseCustomId(customId) {
	const [action, ideaId] = customId.split(':');
	return { action, ideaId };
}

export async function handleJoinToggle(interaction) {
	const { ideaId } = parseCustomId(interaction.customId);
	const userId = interaction.user.id;

	const { data: existing } = await supabase
		.from('idea_participants')
		.select('idea_id')
		.eq('idea_id', ideaId)
		.eq('user_id', userId)
		.maybeSingle();

	if (existing) {
		await supabase
			.from('idea_participants')
			.delete()
			.eq('idea_id', ideaId)
			.eq('user_id', userId);
	} else {
		await supabase
			.from('idea_participants')
			.insert({ idea_id: ideaId, user_id: userId });
	}

	await syncAllMessagesForIdea(interaction.client, ideaId);
	await interaction.deferUpdate();
}

export async function syncAllMessagesForIdea(client, ideaId) {
	const [{ data: participants }, { data: links }, { data: idea }] = await Promise.all([
		supabase.from('idea_participants').select('user_id').eq('idea_id', ideaId),
		supabase.from('idea_messages').select('channel_id, message_id').eq('idea_id', ideaId),
		supabase.from('ideas').select('text').eq('idea_id', ideaId).single()
	]);

	const participantText = participants?.length
		? participants.map((p) => `<@${p.user_id}>`).join('\n')
		: 'No one yet';

	const embed = new EmbedBuilder()
		.setTitle('Hype Chain Proposal')
		.setDescription(idea.text)
		.addFields({ name: 'Participants', value: participantText });

	for (const link of links ?? []) {
		try {
			const channel = await client.channels.fetch(link.channel_id);
			const message = await channel.messages.fetch(link.message_id);
			await message.edit({ embeds: [embed] });
		} catch (err) {
			// Not Found or missing access: remove stale mapping and continue.
			await supabase
				.from('idea_messages')
				.delete()
				.eq('idea_id', ideaId)
				.eq('message_id', link.message_id);
		}
	}
}
```

### 8.5 Forward Handler (Skeleton)

```js
import { ChannelType } from 'discord.js';
import { supabase } from './supabase.js';
import { syncAllMessagesForIdea } from './toggle.js';

export async function handleForward(interaction, ideaId, targetChannelId) {
	const channel = await interaction.guild.channels.fetch(targetChannelId);
	if (!channel || channel.type !== ChannelType.GuildText) {
		return interaction.reply({ content: 'Invalid target channel.', ephemeral: true });
	}

	const perms = channel.permissionsFor(interaction.guild.members.me);
	if (!perms?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
		return interaction.reply({ content: 'I lack permission in that channel.', ephemeral: true });
	}

	// Post first, then run sync so the new copy has the latest participant list.
	const posted = await channel.send({ content: 'Synced Hype Chain proposal' });

	await supabase.from('idea_messages').insert({
		idea_id: ideaId,
		guild_id: interaction.guildId,
		channel_id: channel.id,
		message_id: posted.id
	});

	await syncAllMessagesForIdea(interaction.client, ideaId);
	return interaction.reply({ content: 'Forwarded and synced.', ephemeral: true });
}
```