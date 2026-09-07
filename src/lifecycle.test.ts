import { afterEach, expect, it, vi } from "vitest";
import { Chat } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { MattermostAdapter } from "./adapter";
import type { MattermostPost } from "./types";

afterEach(() => vi.unstubAllGlobals());

it("dispatches edits and deletions only to SDK lifecycle handlers", async () => {
	const adapter = new MattermostAdapter({
		baseUrl: "https://mattermost.example.com",
		botToken: "test-token",
		websocket: { enabled: false },
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			return new Response(
				JSON.stringify(
					url.endsWith("/users/me")
						? { id: "bot", username: "bot", is_bot: true }
						: { id: "user", username: "alice" },
				),
			);
		}),
	);
	const bot = new Chat({
		userName: "bot",
		adapters: { mattermost: adapter },
		state: createMemoryState(),
	});
	const updated = vi.fn();
	const deleted = vi.fn();
	const mentioned = vi.fn();
	const subscribed = vi.fn();
	const newMessage = vi.fn();
	bot.onMessageUpdated(updated);
	bot.onMessageDeleted(deleted);
	bot.onNewMention(mentioned);
	bot.onSubscribedMessage(subscribed);
	bot.onNewMessage(/.*/, newMessage);
	await bot.initialize();
	try {
		const post: MattermostPost = {
			id: "post",
			channel_id: "channel",
			root_id: "root",
			user_id: "user",
			message: "@bot updated",
			type: "",
			create_at: 1,
			update_at: 2,
			edit_at: 2,
			delete_at: 0,
			is_pinned: false,
		};
		const threadId = adapter.encodeThreadId({ channelId: "channel", rootPostId: "root" });
		await bot.thread(threadId).subscribe();
		await adapter["handleWebSocketPayload"]({
			event: "post_edited",
			data: { post: JSON.stringify(post), channel_type: "O" },
		});
		expect(updated).toHaveBeenCalledOnce();
		expect(updated.mock.calls[0][1]).toMatchObject({
			id: "post",
			text: "@bot updated",
			metadata: { edited: true },
		});
		expect(updated.mock.calls[0][2]).toBeUndefined();
		await adapter["handleWebSocketPayload"]({
			event: "post_edited",
			data: { post: { ...post, user_id: "bot" } },
		});
		expect(updated).toHaveBeenCalledOnce();
		await adapter["handleWebSocketPayload"]({
			event: "post_deleted",
			data: { post: { ...post, delete_at: 3 } },
		});
		expect(deleted).toHaveBeenCalledOnce();
		expect(deleted.mock.calls[0][0]).toMatchObject({
			adapter,
			platform: "mattermost",
			messageId: "post",
			threadId,
			channelId: adapter.channelIdFromThreadId(threadId),
			deletedAt: new Date(3),
			previousMessage: { id: "post", text: "@bot updated" },
		});
		expect(mentioned).not.toHaveBeenCalled();
		expect(subscribed).not.toHaveBeenCalled();
		expect(newMessage).not.toHaveBeenCalled();
	} finally {
		await bot.shutdown();
	}
});

it("ignores malformed or uninitialized delete events", async () => {
	const adapter = new MattermostAdapter({ baseUrl: "https://example.com", botToken: "test" });
	await expect(
		adapter["handleWebSocketPayload"]({ event: "post_deleted", data: { post: "not json" } }),
	).resolves.toBeUndefined();
	await expect(
		adapter["handleWebSocketPayload"]({
			event: "post_deleted",
			data: { post: { id: "post" } },
		}),
	).resolves.toBeUndefined();
});
