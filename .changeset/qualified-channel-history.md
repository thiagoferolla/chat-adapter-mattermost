---
"chat-adapter-mattermost": patch
---

Return SDK-qualified channel IDs while continuing to accept native IDs in public channel methods. Fix channel-history query URLs, exclude replies, and support chronological forward/backward pagination without relying on Mattermost's optional has_next flag.
