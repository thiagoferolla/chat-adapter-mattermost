import { afterEach, expect, it, vi } from "vitest";
import { Chat, type Logger } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { MattermostAdapter } from "./adapter";

afterEach(() => vi.unstubAllGlobals());

interface LogCall {
	level: string;
	message: string;
	args: unknown[];
}

function createRecordingLogger(): { logger: Logger; calls: LogCall[] } {
	const calls: LogCall[] = [];
	const logger: Logger = {
		child: () => logger,
		debug: (message, ...args) => void calls.push({ level: "debug", message, args }),
		info: (message, ...args) => void calls.push({ level: "info", message, args }),
		warn: (message, ...args) => void calls.push({ level: "warn", message, args }),
		error: (message, ...args) => void calls.push({ level: "error", message, args }),
	};

	return { logger, calls };
}

function createAdapter(logger: Logger): MattermostAdapter {
	return new MattermostAdapter({
		baseUrl: "https://mattermost.example.com",
		botToken: "test-bot-token",
		callbackUrl: "https://bot.example.com/webhooks/mattermost",
		callbackSecret: "test-only-dedicated-callback-secret-32-bytes",
		websocket: { enabled: false },
		logger,
	});
}

async function initialize(adapter: MattermostAdapter, logger: Logger): Promise<void> {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(JSON.stringify({ id: "bot", username: "bot" }))),
	);
	const bot = new Chat({
		userName: "bot",
		adapters: { mattermost: adapter },
		state: createMemoryState(),
		logger,
	});

	await adapter.initialize(bot);
}

it("logs the reason and identifiers when a callback fails authentication", async () => {
	const { logger, calls } = createRecordingLogger();
	const adapter = createAdapter(logger);
	await initialize(adapter, logger);

	const request = new Request("https://bot.example.com/webhooks/mattermost", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			user_id: "user-1",
			post_id: "post-1",
			channel_id: "channel-1",
			context: {
				action_id: "approve",
				channel_id: "channel-1",
				nonce: "0".repeat(32),
				signature: "0".repeat(64),
			},
		}),
	});

	expect((await adapter.handleWebhook(request)).status).toBe(401);

	const rejection = calls.find((call) => call.message === "Mattermost webhook rejected");

	expect(rejection?.level).toBe("warn");
	expect(rejection?.args[0]).toMatchObject({
		actionId: "approve",
		channelId: "channel-1",
		postId: "post-1",
		reason: "invalid_callback_authentication",
		status: 401,
		userId: "user-1",
	});
});

it("logs the lookup failure when an action callback cannot verify its post", async () => {
	const { logger, calls } = createRecordingLogger();
	const adapter = createAdapter(logger);
	await initialize(adapter, logger);
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () => new Response(JSON.stringify({ message: "lookup failed" }), { status: 500 }),
		),
	);

	const response = await adapter["handleActionCallback"]({
		user_id: "user-1",
		post_id: "post-1",
		channel_id: "channel-1",
		context: { action_id: "approve", action_value: "yes" },
	});

	expect(response.status).toBe(502);

	const failure = calls.find(
		(call) => call.message === "Mattermost action callback post verification failed",
	);

	expect(failure?.level).toBe("error");
	expect(failure?.args[0]).toMatchObject({
		channelId: "channel-1",
		postId: "post-1",
		status: 502,
		userId: "user-1",
	});
	expect(failure?.args[1]).toBeInstanceOf(Error);
});

it("logs a websocket event that is dropped because its payload cannot be parsed", async () => {
	const { logger, calls } = createRecordingLogger();
	const adapter = createAdapter(logger);
	await initialize(adapter, logger);

	await adapter["handleWebSocketPayload"]({
		event: "posted",
		seq: 42,
		data: { post: "not json" },
	});

	const ignored = calls.find((call) => call.message === "Mattermost websocket event ignored");

	expect(ignored?.level).toBe("warn");
	expect(ignored?.args[0]).toMatchObject({
		event: "posted",
		reason: "unparsable_post",
		seq: 42,
	});
});
