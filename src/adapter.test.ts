import { afterEach, describe, expect, it, vi } from "vitest";
import { MattermostAdapter } from "./adapter";
import type { MattermostPost, MattermostUser } from "./types";

function createAdapter() {
	return new MattermostAdapter({
		baseUrl: "https://mattermost.example.com",
		botToken: "test-token",
		userName: "mattermost-bot",
	});
}

function createPost(overrides: Partial<MattermostPost> = {}): MattermostPost {
	return {
		id: "post-1",
		channel_id: "channel-1",
		user_id: "user-1",
		message: "hello world",
		type: "",
		create_at: 1,
		update_at: 1,
		edit_at: 0,
		delete_at: 0,
		is_pinned: false,
		...overrides,
	};
}

function createUser(overrides: Partial<MattermostUser> = {}): MattermostUser {
	return {
		id: "user-1",
		username: "alice",
		...overrides,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("MattermostAdapter", () => {
	it("roundtrips thread IDs", () => {
		const adapter = createAdapter();
		const encoded = adapter.encodeThreadId({
			channelId: "channel-123",
			rootPostId: "root-456",
		});

		expect(adapter.decodeThreadId(encoded)).toEqual({
			channelId: "channel-123",
			rootPostId: "root-456",
		});
	});

	it("returns 200 from handleWebhook", async () => {
		const adapter = createAdapter();
		const response = await adapter.handleWebhook(
			new Request("https://example.com/webhook", { method: "POST" }),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("OK");
	});

	it("marks mentions from websocket mention payloads", async () => {
		const adapter = createAdapter() as MattermostAdapter & {
			chat: { processMessage: ReturnType<typeof vi.fn> };
			botUserId: string;
			users: Map<string, MattermostUser>;
			handlePostedEvent: (payload: unknown) => Promise<void>;
		};
		const processMessage = vi.fn();
		adapter.chat = { processMessage };
		adapter.botUserId = "bot-user";
		adapter.users.set("user-1", createUser());

		await adapter.handlePostedEvent({
			data: {
				post: JSON.stringify(createPost()),
				mentions: JSON.stringify(["bot-user"]),
			},
		});

		expect(processMessage).toHaveBeenCalledTimes(1);
		const messageFactory = processMessage.mock.calls[0][2] as () => Promise<{
			isMention?: boolean;
		}>;
		const message = await messageFactory();

		expect(message.isMention).toBe(true);
	});

	it("accepts websocket embedded objects for edited posts", async () => {
		const adapter = createAdapter() as MattermostAdapter & {
			chat: { processMessage: ReturnType<typeof vi.fn> };
			users: Map<string, MattermostUser>;
			handleWebSocketPayload: (payload: unknown) => Promise<void>;
		};
		const processMessage = vi.fn();
		adapter.chat = { processMessage };
		adapter.users.set("user-1", createUser());

		await adapter.handleWebSocketPayload({
			event: "post_edited",
			data: {
				post: createPost({ message: "edited" }),
			},
		});

		expect(processMessage).toHaveBeenCalledTimes(1);
	});

	it("parses binary websocket payloads", () => {
		const adapter = createAdapter() as MattermostAdapter & {
			parseWebSocketPayload: (data: unknown) => unknown;
		};
		const payload = { event: "posted", data: { post: JSON.stringify(createPost()) } };
		const binary = new TextEncoder().encode(JSON.stringify(payload));

		expect(adapter.parseWebSocketPayload(binary)).toEqual(payload);
	});

	it("returns null when fetchMessage gets a 404", async () => {
		const adapter = createAdapter();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ message: "missing" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		const result = await adapter.fetchMessage(
			adapter.encodeThreadId({ channelId: "channel-1", rootPostId: "root-1" }),
			"missing",
		);

		expect(result).toBeNull();
	});

	it("bounds user and channel caches", () => {
		const adapter = createAdapter() as MattermostAdapter & {
			users: Map<string, MattermostUser>;
			channels: Map<string, { id: string; name: string; type: "O" }>;
			setCachedValue: <TKey, TValue>(
				cache: Map<TKey, TValue>,
				key: TKey,
				value: TValue,
				maxSize: number,
			) => void;
		};

		for (let index = 0; index < 3; index += 1) {
			adapter.setCachedValue(
				adapter.users,
				`user-${index}`,
				createUser({ id: `user-${index}`, username: `user${index}` }),
				2,
			);
			adapter.setCachedValue(
				adapter.channels,
				`channel-${index}`,
				{ id: `channel-${index}`, name: `channel-${index}`, type: "O" },
				2,
			);
		}

		expect(adapter.users.size).toBe(2);
		expect(adapter.channels.size).toBe(2);
		expect(adapter.users.has("user-0")).toBe(false);
		expect(adapter.channels.has("channel-0")).toBe(false);
	});
});
