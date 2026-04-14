# chat-adapter-mattermost

Mattermost adapter for [Vercel Chat SDK](https://chat-sdk.dev/).

## Install

```bash
pnpm add chat-adapter-mattermost chat
```

Requires Node.js >= 20 and a Mattermost server with a bot account.

## Quick start

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

Configuration can also be provided through environment variables:

```bash
export MATTERMOST_BASE_URL=https://mattermost.example.com
export MATTERMOST_BOT_TOKEN=your-bot-token
```

```ts
const adapter = createMattermostAdapter();
```

## Mattermost setup

1. **Create a bot account** -- In Mattermost, go to **System Console > Integrations > Bot Accounts** and create a new bot. Copy the generated access token.

2. **Enable integrations** -- Make sure your Mattermost server allows bot accounts and has the REST API and WebSocket gateway accessible. These are enabled by default.

3. **Add the bot to channels** -- Add the bot user to any channels where it should respond. The bot will only receive events from channels it is a member of.

4. **Interactive actions (optional)** -- To use buttons and selects, set `callbackUrl` to a public URL that Mattermost can reach. The adapter exposes `handleWebhook()` for this purpose:

    ```ts
    adapter.handleWebhook(request);
    ```

    Register this URL in **System Console > Integrations > Interactive Dialogs** or per-post via the `integration` field.

## Feature Support

| Feature              | Status | Notes                                                                                                            |
| -------------------- | :----: | ---------------------------------------------------------------------------------------------------------------- |
| Message posting      |   ✅   | Post, edit, and delete messages in channels and threads.                                                         |
| Overlapping messages |   ✅   | Stable thread IDs and `lockScope = "thread"` let Chat SDK concurrency strategies work as expected.               |
| Direct messages      |   ✅   | `openDM()` and `isDM()` are implemented.                                                                         |
| Emoji / Reactions    |   ✅   | Outgoing emoji formatting plus add/remove reaction handling.                                                     |
| Ephemeral messages   |   ✅   | Uses Mattermost's native `/posts/ephemeral` API.                                                                 |
| Typing indicators    |   ✅   | `startTyping()` sends Mattermost typing events.                                                                  |
| File uploads         |   🟡   | Sending and receiving file attachments work, but editing a message with new uploads is not supported.            |
| Cards                |   🟡   | Card payloads are rendered as plain-text fallback with interactive action attachments when `callbackUrl` is set. |
| Streaming            |   🟡   | Falls back to post-and-edit streaming. No native streaming transport.                                            |
| Error handling       |   🟡   | Maps auth, permission, not-found, and network failures. Rate-limit handling is not yet exposed.                  |
| Actions              |   ❌   | Interactive button and select callbacks are handled, but the full action lifecycle is not complete.              |
| Modals               |   ❌   | No modal open or submit flows.                                                                                   |
| Slash commands       |   ❌   | No slash-command parsing or dispatch.                                                                            |

## Notes

- The adapter connects to Mattermost over the REST API v4 and the `/api/v4/websocket` gateway.
- Thread IDs are encoded as `mattermost:<base64url(channelId)>` for channel-level contexts or `mattermost:<base64url(channelId)>:<base64url(rootPostId)>` for threaded replies.
- User and channel data are cached in-memory with LRU eviction (up to 1000 entries each).
- WebSocket reconnection uses exponential backoff with jitter (1 s base, 30 s max).
- This is a community adapter. The `@chat-adapter/*` npm scope is reserved for official adapters; this package is published as `chat-adapter-mattermost`.

## License

[MIT](LICENSE) © Thiago Ferolla
