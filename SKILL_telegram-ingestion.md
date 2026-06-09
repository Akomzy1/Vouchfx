# SKILL: telegram-ingestion

**Repo location:** `.claude/skills/telegram-ingestion/SKILL.md`
**Owns:** reading signals from the channels a user belongs to, via GramJS MTProto user clients — safely and read-only.

## Why MTProto user client (not Bot API)
The Bot API cannot read messages in channels/groups a bot hasn't been added to — and paid VIP signal channels won't add bots. The only way to read the channels a user is already in is to act as that user's own Telegram client via MTProto (GramJS). This is what every competitor does.

## The read-only rule (ban prevention — non-negotiable)
A user session must perform **zero** write/outbound operations: no sending, replying, reacting, joining, leaving, marking-read, typing, or contact actions. The only allowed operations are connecting, receiving updates, and reading message/channel metadata. There must be no code path that can write via a user session. This is the primary determinant of whether users' Telegram accounts stay un-flagged.

## Connection & sessions
- Connect via QR login or phone-number + code (handle the 2FA password case).
- Store the session as an encrypted **string session** (AES-256-GCM, key via Vault/KMS). Decrypt only in worker memory. Never log it.
- For MVP, run a **single supervised listener process** holding a pool of user clients; map `user_id → client`. Scale to machine-per-user (Fly Machines API) only later.
- Heartbeat each client; on disconnect, reconnect with backoff; surface session health (incl. Telegram "limited/SpamBot" status) to the dashboard.

## Channel discovery & selection
- List all dialogs (channels/groups) the user belongs to; let them enable/disable per channel and set per-channel overrides.
- Subscribe to new-message events only for enabled channels.

## Emitting signal jobs
- On a new message in an enabled channel, enqueue a job with the idempotency id `${chat_id}:${message_id}:${edit_version}` and the raw text + any media reference.
- **Edits:** Telegram delivers an edit event with an incremented edit version. Enqueue it; the parser/executor decide if it's a modify or a cancel.
- **Deletions:** Telegram delivers a delete event (message id, no content). Emit a synthetic job pre-tagged `CANCEL_PENDING` referencing the original signal so the executor can cancel an unfilled order. Persist enough message→signal mapping to resolve which trade a deletion refers to.
- Download image/screenshot media and pass a reference for vision parsing.

## Reliability & idempotency
- The queue + the `(source_id, telegram_message_id)` unique constraint guarantee a message processed twice never produces two trades.
- On listener restart, do not replay historical messages blindly; rely on the idempotency key so any re-delivered message is a no-op if already handled.

## Security
- One session per user, the user's own — never a shared VouchFX-owned account.
- Document clearly to users that VouchFX acts as a read-only Telegram client on their behalf.
