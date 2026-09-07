# Changelog

## 2.0.0

### Major Changes

- [#37](https://github.com/thiagoferolla/chat-adapter-mattermost/pull/37) [`1a3f19d`](https://github.com/thiagoferolla/chat-adapter-mattermost/commit/1a3f19da4fba2b38edf4a9b1fc57041c7d3a5e1f) Thanks [@thiagoferolla](https://github.com/thiagoferolla)! - Require a dedicated callbackSecret (or MATTERMOST_CALLBACK_SECRET through the factory) of at least 32 bytes when callbackUrl is configured. Sign confidential Mattermost action context with HMAC-SHA-256, validate channel bindings and select values before dispatch, and strip authentication fields from action events. Unsigned callbacks are rejected: repost or edit existing interactive cards after upgrading, and after rotating the secret or changing the server/callback URL. Non-interactive configurations are unchanged.

    Correct the quick-start example to configure a state adapter and register handlers before connecting, and document authenticated callback setup and its replay/authorization boundaries.

    Fail closed when the callback post cannot be fetched or belongs to another channel. Interactive callbacks from ephemeral posts are not supported because their message targets cannot be verified; native ephemeral posting is unchanged.

### Minor Changes

- [#38](https://github.com/thiagoferolla/chat-adapter-mattermost/pull/38) [`6ca8e21`](https://github.com/thiagoferolla/chat-adapter-mattermost/commit/6ca8e2126c94b4574d153f0a6f15426a63192f5b) Thanks [@thiagoferolla](https://github.com/thiagoferolla)! - Require Chat SDK 4.40.0 or newer and dispatch Mattermost edits and deletions through the dedicated message lifecycle handlers instead of treating edits as new messages or ignoring deletes.

### Patch Changes

- [#36](https://github.com/thiagoferolla/chat-adapter-mattermost/pull/36) [`5c43b8d`](https://github.com/thiagoferolla/chat-adapter-mattermost/commit/5c43b8dd751237d0586d1b4aec83a7dcaf8d2fed) Thanks [@thiagoferolla](https://github.com/thiagoferolla)! - Return SDK-qualified channel IDs while continuing to accept native IDs in public channel methods. Fix channel-history query URLs, exclude replies, and support chronological forward/backward pagination without relying on Mattermost's optional has_next flag.

## 1.1.3

### Patch Changes

- [#13](https://github.com/thiagoferolla/chat-adapter-mattermost/pull/13) [`45e6c2c`](https://github.com/thiagoferolla/chat-adapter-mattermost/commit/45e6c2c1153b1f243b78c858eb87a37471930095) Thanks [@thiagoferolla](https://github.com/thiagoferolla)! - Update Chat SDK peer and adapter types to match Chat SDK 4.29.0.

All notable changes to this project will be documented in this file. See [CONTRIBUTING.md](CONTRIBUTING.md) for instructions on how to add a changeset.

The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.2] - 2025-04-14

### Changed

- Updated dependencies

## [1.1.1] - 2025-04-10

### Changed

- Updated dependencies

## [1.1.0] - 2025-04-06

### Added

- Card rendering with interactive actions (buttons, selects, radio selects)
- Webhook handling for action callbacks
- Edit with attachments support

## [1.0.0] - 2025-03-30

### Added

- Initial release
- Mattermost REST API client with bot token authentication
- WebSocket listener with automatic reconnection
- Thread ID encoding/decoding
- Message posting, editing, deletion
- Reactions (add/remove)
- Typing indicators
- Ephemeral messages
- Direct message opening
- File uploads
- Format conversion (Mattermost markdown <-> AST)
- Emoji support
- User and channel caching (LRU)
- Error mapping

[1.1.2]: https://github.com/thiagoferolla/chat-adapter-mattermost/releases/tag/v1.1.2
[1.1.1]: https://github.com/thiagoferolla/chat-adapter-mattermost/releases/tag/v1.1.1
[1.1.0]: https://github.com/thiagoferolla/chat-adapter-mattermost/releases/tag/v1.1.0
[1.0.0]: https://github.com/thiagoferolla/chat-adapter-mattermost/releases/tag/v1.0.0
