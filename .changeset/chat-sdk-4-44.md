---
"chat-adapter-mattermost": minor
---

Update to Chat SDK 4.44. The `chat` peer dependency is now `^4.44.0`.

- Build incoming and fetched messages with `parseIncoming()`, so very long or pathological posts keep their content in `text` without slow or failing markdown parsing.
- Report `isMention` as `undefined` instead of `false` when the bot isn't mentioned, so the SDK's text-based mention detection still applies under the 4.41 `isMention` contract.
