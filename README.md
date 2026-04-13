# chat-adapter-mattermost

Mattermost adapter for [Vercel Chat SDK](https://chat-sdk.dev/).

This project aims to make Mattermost feel like a first-class Chat SDK platform so you can write bot logic once and run it inside Mattermost channels, threads, and direct messages.

## Status

Working community adapter with a Mattermost REST client, websocket listener, thread ID encoding, message parsing, message posting/editing/deletion, reactions, typing indicators, channel metadata, and DM opening.

## Goal

Chat SDK provides a common adapter interface for chat platforms. This repository is intended to implement a **community adapter** for Mattermost that:

- verifies and handles Mattermost webhooks and events
- maps Mattermost messages, threads, channels, users, and reactions into Chat SDK primitives
- lets Chat SDK handlers post replies, edit messages, and manage thread interactions through Mattermost APIs
- keeps bot logic platform-agnostic so the same handlers can be reused across Slack, Discord, Mattermost, and other Chat SDK adapters

## Intended API

The target developer experience is something close to this:

```ts
import { Chat } from "chat";
import { createMattermostAdapter } from "chat-adapter-mattermost";

const adapter = createMattermostAdapter({
  baseUrl: process.env.MATTERMOST_BASE_URL!,
  botToken: process.env.MATTERMOST_BOT_TOKEN!,
});

const bot = new Chat({
  userName: "my-bot",
  adapters: {
    mattermost: adapter,
  },
});

await bot.initialize();

bot.onNewMention(async (thread) => {
  await thread.subscribe();
  await thread.post("Hello from Mattermost via Chat SDK.");
});
```

The adapter connects to Mattermost over the REST API and the `/api/v4/websocket` gateway.

## Chat SDK Feature Support

| Chat SDK feature | Support | Notes |
| --- | --- | --- |
| Overlapping Messages | ✅ | Stable thread IDs and `lockScope = "thread"` let Chat SDK concurrency strategies work as expected. |
| Actions | ❌ | The adapter does not currently handle interactive button or select callbacks. |
| Cards | 🟡 | Card payloads are accepted, but they are rendered as plain-text fallback content instead of native Mattermost interactive UI. |
| Direct messages | ✅ | `openDM()` and `isDM()` are implemented for Mattermost direct-message threads. |
| Emoji | ✅ | Outgoing emoji formatting plus add/remove reaction handling are implemented. |
| Ephemeral messages | ✅ | Uses Mattermost's native `/posts/ephemeral` API. |
| File uploads | 🟡 | Sending files and parsing incoming file attachments work, but editing a message with new uploads is not supported yet. |
| Modals | ❌ | The adapter does not currently expose modal open or submit flows. |
| Slash Commands | ❌ | No slash-command parsing or dispatch is implemented yet. |
| Streaming | 🟡 | Chat SDK can fall back to post-and-edit streaming because message posting and editing are implemented, but there is no native streaming transport. |
| Error handling | 🟡 | The adapter maps auth, permission, not-found, validation, and network failures, but it does not yet expose richer rate-limit handling. |

## What This Is Not

- not a Mattermost server plugin
- not a replacement for Chat SDK itself
- not a full bot framework on its own

This repository is specifically about the adapter layer between Mattermost and Chat SDK.

## Packaging Note

Per the Chat SDK adapter guidelines, the `@chat-adapter/*` npm scope is reserved for official adapters. If this project is published independently, it should remain a community package name such as `chat-adapter-mattermost` or another non-reserved scope.

## References

- Chat SDK: https://chat-sdk.dev/
- Chat SDK adapters: https://chat-sdk.dev/adapters
- Building a community adapter: https://chat-sdk.dev/docs/contributing/building
- Mattermost developer documentation: https://developers.mattermost.com/
