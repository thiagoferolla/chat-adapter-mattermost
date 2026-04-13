# chat-adapter-mattermost

Mattermost adapter for [Vercel Chat SDK](https://chat-sdk.dev/).

This project aims to make Mattermost feel like a first-class Chat SDK platform so you can write bot logic once and run it inside Mattermost channels, threads, and direct messages.

## Status

Early-stage project. The repository is currently just the initial scaffold and documentation.

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

const bot = new Chat({
  userName: "my-bot",
  adapters: {
    mattermost: createMattermostAdapter({
      baseUrl: process.env.MATTERMOST_BASE_URL!,
      botToken: process.env.MATTERMOST_BOT_TOKEN!,
      signingSecret: process.env.MATTERMOST_SIGNING_SECRET!,
    }),
  },
});

bot.onNewMention(async (thread) => {
  await thread.subscribe();
  await thread.post("Hello from Mattermost via Chat SDK.");
});
```

The exact config and exported API may change as the adapter is implemented.

## Planned Scope

Initial MVP:

- webhook and request verification
- incoming message parsing
- thread ID encoding and decoding
- mention detection
- posting replies to threads
- basic message formatting

Likely follow-up work:

- reactions
- direct messages
- slash commands
- file uploads
- ephemeral messages
- richer formatting and cards where the platform allows it
- adapter tests against Mattermost fixtures or a local Mattermost instance

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
