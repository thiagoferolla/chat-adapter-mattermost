---
"chat-adapter-mattermost": major
---

Require a dedicated callbackSecret (or MATTERMOST_CALLBACK_SECRET through the factory) of at least 32 bytes when callbackUrl is configured. Sign confidential Mattermost action context with HMAC-SHA-256, validate channel bindings and select values before dispatch, and strip authentication fields from action events. Unsigned callbacks are rejected: repost or edit existing interactive cards after upgrading, and after rotating the secret or changing the server/callback URL. Non-interactive configurations are unchanged.

Correct the quick-start example to configure a state adapter and register handlers before connecting, and document authenticated callback setup and its replay/authorization boundaries.

Fail closed when the callback post cannot be fetched or belongs to another channel. Interactive callbacks from ephemeral posts are not supported because their message targets cannot be verified; native ephemeral posting is unchanged.
