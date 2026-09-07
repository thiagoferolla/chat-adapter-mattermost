import { afterEach, describe, expect, it, vi } from "vitest";
import { Chat } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { MattermostAdapter } from "./adapter";
import type { MattermostPost } from "./types";

afterEach(() => vi.unstubAllGlobals());

function createPost(index: number, root = true): MattermostPost {
	return {
		id: `post-${index}`,
		channel_id: "channel-1",
		user_id: "user-1",
		message: `message ${index}`,
		type: "",
		create_at: index,
		update_at: index,
		edit_at: 0,
		delete_at: 0,
		is_pinned: false,
		root_id: root ? "" : "thread-root",
	};
}

function setup(posts: MattermostPost[] = []) {
	const adapter = new MattermostAdapter({
		baseUrl: "https://mattermost.example.com/subpath/",
		botToken: "test-token",
		websocket: { enabled: false },
	});
	const fetch = vi.fn(async (input: string, init?: RequestInit) => {
		const url = new URL(input);
		expect(url.pathname).not.toContain("%3F");
		expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
		let result: unknown;
		switch (url.pathname) {
			case "/subpath/api/v4/channels/channel-1/posts": {
				expect(url.searchParams.get("skipFetchThreads")).toBe("true");
				expect(url.searchParams.get("per_page")).toBe("200");
				const page = Number(url.searchParams.get("page"));
				const batch = posts.slice(page * 200, (page + 1) * 200);
				result = {
					order: batch.map((post) => post.id),
					posts: {
						"extra-parent": createPost(9999),
						...Object.fromEntries(batch.map((post) => [post.id, post])),
					},
				};
				break;
			}
			case "/subpath/api/v4/users/me":
				result = { id: "bot", username: "bot" };
				break;
			case "/subpath/api/v4/users/user-1":
				result = { id: "user-1", username: "alice" };
				break;
			case "/subpath/api/v4/channels/channel-1":
			case "/subpath/api/v4/channels/direct":
				result = { id: "channel-1", name: "Direct", type: "D" };
				break;
			case "/subpath/api/v4/posts":
				expect(JSON.parse(init?.body as string).channel_id).toBe("channel-1");
				result = createPost(1);
				break;
			default:
				throw new Error(`Unexpected request: ${input}`);
		}
		return new Response(JSON.stringify(result));
	});
	vi.stubGlobal("fetch", fetch);
	const channelId = adapter.encodeThreadId({ channelId: "channel-1" });
	return { adapter, fetch, channelId };
}

describe("channel history", () => {
	it("keeps same-timestamp posts across page boundaries and bounds fractional limits", async () => {
		const posts = Array.from({ length: 201 }, (_, i) => ({
			...createPost(201 - i),
			create_at: 1,
		}));
		const { adapter, channelId } = setup(posts);
		const first = await adapter.fetchChannelMessages(channelId, { limit: 200 });
		const last = await adapter.fetchChannelMessages(channelId, {
			limit: 1.5,
			cursor: first.nextCursor,
		});
		expect(first.messages).toHaveLength(200);
		expect(last.messages.map((message) => message.id)).toEqual(["post-1"]);
		expect(last.nextCursor).toBeUndefined();
		expect(
			new Set([...first.messages, ...last.messages].map((message) => message.id)).size,
		).toBe(201);
	});
	it.each(["backward", "forward"] as const)(
		"paginates %s through reply-only pages without has_next",
		async (direction) => {
			const roots = new Set([1, 2, 3, 404, 405, 605]);
			const posts = Array.from({ length: 605 }, (_, index) =>
				createPost(605 - index, roots.has(605 - index)),
			);
			const { adapter, channelId } = setup(posts);
			let cursor: string | undefined;
			const pages: string[][] = [];
			do {
				const result = await adapter.fetchChannelMessages(channelId, {
					direction,
					limit: 2,
					cursor,
				});
				expect(result.messages).toHaveLength(2);
				expect(result.messages[0].metadata.dateSent.getTime()).toBeLessThan(
					result.messages[1].metadata.dateSent.getTime(),
				);
				pages.push(result.messages.map((message) => message.id));
				cursor = result.nextCursor;
				expect(pages.length).toBeLessThanOrEqual(3);
			} while (cursor);
			expect(pages).toEqual(
				direction === "backward"
					? [
							["post-405", "post-605"],
							["post-3", "post-404"],
							["post-1", "post-2"],
						]
					: [
							["post-1", "post-2"],
							["post-3", "post-404"],
							["post-405", "post-605"],
						],
			);
		},
	);

	it.each(["backward", "forward"] as const)(
		"handles empty and reply-only histories %s",
		async (direction) => {
			for (const posts of [
				[],
				Array.from({ length: 400 }, (_, i) => createPost(400 - i, false)),
			]) {
				const { adapter, channelId } = setup(posts);
				expect(await adapter.fetchChannelMessages(channelId, { direction })).toEqual({
					messages: [],
					nextCursor: undefined,
				});
			}
		},
	);

	it("preserves unconsumed posts when the requested limit changes", async () => {
		const { adapter, channelId } = setup([createPost(3), createPost(2), createPost(1)]);
		const first = await adapter.fetchMessages(channelId, { limit: 1 });
		const second = await adapter.fetchChannelMessages("channel-1", {
			limit: 2,
			cursor: first.nextCursor,
		});
		expect(first.messages.map((message) => message.id)).toEqual(["post-3"]);
		expect(second.messages.map((message) => message.id)).toEqual(["post-1", "post-2"]);
		expect(second.nextCursor).toBeUndefined();
	});

	it("rejects malformed, cross-channel and cross-direction cursors before fetching", async () => {
		const { adapter, channelId, fetch } = setup([createPost(2), createPost(1)]);
		const { nextCursor } = await adapter.fetchChannelMessages(channelId, { limit: 1 });
		fetch.mockClear();
		await expect(adapter.fetchChannelMessages(channelId, { cursor: "1" })).rejects.toThrow(
			"Invalid Mattermost channel history cursor",
		);
		await expect(
			adapter.fetchChannelMessages("channel-2", { cursor: nextCursor }),
		).rejects.toThrow("Invalid Mattermost channel history cursor");
		await expect(
			adapter.fetchChannelMessages(channelId, { direction: "forward", cursor: nextCursor }),
		).rejects.toThrow("Invalid Mattermost channel history cursor");
		expect(fetch).not.toHaveBeenCalled();
	});
});

it("uses qualified SDK channel IDs while preserving native REST and cache IDs", async () => {
	const { adapter, channelId } = setup([createPost(1)]);
	const bot = new Chat({
		userName: "bot",
		adapters: { mattermost: adapter },
		state: createMemoryState(),
	});
	await bot.initialize();
	try {
		const threadId = adapter.encodeThreadId({ channelId: "channel-1", rootPostId: "post-1" });
		expect(adapter.channelIdFromThreadId(threadId)).toBe(channelId);
		expect(bot.channel(channelId).id).toBe(channelId);
		expect((await bot.history.channel.listMessages(channelId)).messages).toHaveLength(1);
		expect(await adapter.fetchChannelInfo(channelId)).toMatchObject({
			id: channelId,
			isDM: true,
		});
		expect(await adapter.fetchChannelInfo("channel-1")).toMatchObject({ id: channelId });
		expect(await adapter.fetchThread(threadId)).toMatchObject({
			id: threadId,
			channelId,
			isDM: true,
		});
		expect(adapter.isDM(threadId)).toBe(true);
		expect(adapter.getChannelVisibility(threadId)).toBe("private");
		expect(await adapter.openDM("user-1")).toBe(channelId);
		await bot.channel(channelId).post("hello");
		await adapter.postChannelMessage("channel-1", "legacy native ID");
		await expect(adapter.fetchChannelInfo(threadId)).rejects.toThrow("Expected a channel ID");
	} finally {
		await bot.shutdown();
	}
});
