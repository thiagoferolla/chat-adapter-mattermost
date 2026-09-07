# chat-adapter-mattermost

Mattermost adapter for [Vercel Chat SDK](https://chat-sdk.dev/).

## Install

```bash
pnpm add chat-adapter-mattermost chat
```

Requires Chat SDK >= 4.40.0 (within major version 4), Node.js >= 20 and a Mattermost server with a bot account. For the default WebSocket transport, use Node.js >= 22 or provide a compatible global `WebSocket` implementation on Node.js 20.

## Quick start

Install a state adapter for subscriptions and locking. This example uses in-memory state:

```bash
pnpm add @chat-adapter/state-memory
```

```ts
import { Chat } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createMattermostAdapter } from "chat-adapter-mattermost";

const adapter = createMattermostAdapter({
	baseUrl: process.env.MATTERMOST_BASE_URL!,
	botToken: process.env.MATTERMOST_BOT_TOKEN!,
});

const bot = new Chat({
	userName: "my-bot",
	state: createMemoryState(),
	adapters: {
		mattermost: adapter,
	},
});

bot.onNewMention(async (thread) => {
	await thread.subscribe();
	await thread.post("Hello from Mattermost via Chat SDK.");
});

// Register handlers before initialization opens the WebSocket connection.
await bot.initialize();
```

In-memory state is for local development or a single ephemeral process. Use a persistent, shared state adapter (such as Redis or PostgreSQL) in production. The default WebSocket connection needs a long-running process; call `await bot.shutdown()` during graceful shutdown.

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

4. **Interactive actions (optional)** -- To use buttons and selects, configure an HTTPS callback URL reachable from Mattermost and a dedicated random signing secret of at least 32 bytes:

    ```ts
    const adapter = createMattermostAdapter({
        callbackUrl: "https://bot.example.com/webhooks/mattermost",
        callbackSecret: process.env.MATTERMOST_CALLBACK_SECRET!,
    });
    ```

    The factory also reads `MATTERMOST_CALLBACK_SECRET` automatically. Generate a secret with `openssl rand -hex 32`, keep it in your secret manager, and share the same value across adapter instances. Do not use the bot token as the callback secret.

    Route POST requests at that URL to `bot.webhooks.mattermost(request)` after configuring the adapter on your `Chat` instance. Pass `{ waitUntil }` as the second argument when your hosting framework supplies it. The adapter attaches the callback URL to each action's `integration` field automatically; no Interactive Dialogs registration is needed.

### Callback security and migration

Mattermost keeps action `integration.context` confidential from ordinary clients. The adapter signs the action ID, button value or allowed select values, channel ID, and a random nonce with HMAC-SHA-256, bound to the server and configured callback URL. It verifies this context before fetching callback data or dispatching an action. Select input is checked against the signed allowed values; authentication fields are removed from `event.raw`.

Callbacks also require a fetchable post belonging to the authenticated channel. Post lookup failures do not dispatch actions. Ephemeral posts cannot be fetched, so their interactive callbacks are not supported; native ephemeral message posting is unchanged.

Existing unsigned buttons are rejected. Repost or edit existing interactive cards after upgrading. Rotating the secret or changing the server/callback URL also requires reposting or editing the cards. Non-interactive adapters do not need a callback secret.

Signed contexts are reusable bearer credentials, not signatures of the complete HTTP request. They do not expire automatically, prevent replay, or independently prove the supplied user identity if the context leaks. Use HTTPS, keep callback bodies out of logs, and apply user authorization and idempotency in privileged action handlers. For stronger server authentication, restrict the endpoint to a trusted gateway or use mTLS at your proxy. See [Mattermost's context authentication guidance](https://developers.mattermost.com/integrate/plugins/interactive-messages/#parameters).

## Feature Support

| Feature              | Status | Notes                                                                                                            |
| -------------------- | :----: | ---------------------------------------------------------------------------------------------------------------- |
| Message posting      |   ✅   | Post, edit, and delete messages in channels and threads.                                                         |
| Message lifecycle    |   ✅   | Incoming edits and deletions dispatch to `onMessageUpdated` and `onMessageDeleted`, not new-message handlers.       |
| Overlapping messages |   ✅   | Stable thread IDs and `lockScope = "thread"` let Chat SDK concurrency strategies work as expected.               |
| Direct messages      |   ✅   | `openDM()` and `isDM()` are implemented.                                                                         |
| Emoji / Reactions    |   ✅   | Outgoing emoji formatting plus add/remove reaction handling.                                                     |
| Ephemeral messages   |   ✅   | Uses Mattermost's native `/posts/ephemeral` API.                                                                 |
| Typing indicators    |   ✅   | `startTyping()` sends Mattermost typing events.                                                                  |
| File uploads         |   🟡   | Sending and receiving file attachments work, but editing a message with new uploads is not supported.            |
| Cards                |   🟡   | Card payloads are rendered as plain-text fallback with interactive action attachments when `callbackUrl` is set. |
| Streaming            |   🟡   | Falls back to post-and-edit streaming. No native streaming transport.                                            |
| Error handling       |   🟡   | Maps auth, permission, not-found, and network failures. Rate-limit handling is not yet exposed.                  |
| Actions              |   🟡   | Authenticated button/select callbacks are supported. Modals and dynamic option loading are not implemented.       |
| Modals               |   ❌   | No modal open or submit flows.                                                                                   |
| Slash commands       |   ❌   | No slash-command parsing or dispatch.                                                                            |

## Notes

- The adapter connects to Mattermost over the REST API v4 and the `/api/v4/websocket` gateway.
- Thread IDs are encoded as `mattermost:<base64url(channelId)>` for channel-level contexts or `mattermost:<base64url(channelId)>:<base64url(rootPostId)>` for threaded replies.
- SDK channel IDs use `mattermost:<base64url(channelId)>`, including those returned by thread/channel metadata. Use these qualified IDs with `bot.channel()` and `bot.history.channel`. Public adapter channel methods still accept bare Mattermost IDs for existing integrations; thread IDs are unchanged.
- Channel history excludes replies and supports forward/backward cursors, with each page returned oldest-first. The first forward request scans to the oldest server page; large channels may require many requests. Cursors are opaque and scoped to the channel and direction; restart pagination without a cursor when upgrading from the old numeric cursors. Mattermost's numbered pages are not snapshots, so concurrent posts/deletions can shift results between requests.
- User and channel data are cached in-memory with LRU eviction (up to 1000 entries each).
- WebSocket reconnection uses exponential backoff with jitter (1 s base, 30 s max).
- This is a community adapter. The `@chat-adapter/*` npm scope is reserved for official adapters; this package is published as `chat-adapter-mattermost`.

## License

[MIT](LICENSE) © Thiago Ferolla
