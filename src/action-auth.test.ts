import { afterEach, describe, expect, it, vi } from "vitest";
import { Chat, type ActionsElement, type CardElement } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { MattermostAdapter } from "./adapter";
import { createMattermostAdapter } from "./factory";

const config = {
	baseUrl: "https://mattermost.example.com",
	botToken: "test-bot-token",
	callbackUrl: "https://bot.example.com/webhooks/mattermost",
	callbackSecret: "test-only-dedicated-callback-secret-32-bytes",
	websocket: { enabled: false },
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

async function setup(
	action: ActionsElement["children"][number] = {
		type: "button",
		id: "approve",
		label: "Approve",
		value: "yes",
	},
) {
	const adapter = new MattermostAdapter(config);
	let posted: {
		props?: {
			attachments: { actions: { integration: { context: Record<string, unknown> } }[] }[];
		};
	} = {};
	const post = {
		id: "post-1",
		channel_id: "channel-1",
		root_id: "root-1",
		user_id: "bot",
		message: "card",
		create_at: 1,
		edit_at: 0,
	};
	const fetch = vi.fn(async (url: string, init?: RequestInit) => {
		if (init?.method === "POST" || init?.method === "PUT") {
			posted = JSON.parse(init.body as string);
			return new Response(JSON.stringify({ ...post, ...posted }));
		}
		return new Response(
			JSON.stringify(
				url.includes("/posts/")
					? post
					: { id: url.endsWith("/me") ? "bot" : "user-1", username: "alice" },
			),
		);
	});
	vi.stubGlobal("fetch", fetch);
	const bot = new Chat({
		userName: "bot",
		adapters: { mattermost: adapter },
		state: createMemoryState(),
	});
	await adapter.initialize(bot);
	const processAction = vi.spyOn(bot, "processAction").mockResolvedValue();
	const card: CardElement = { type: "card", children: [{ type: "actions", children: [action] }] };
	const threadId = adapter.encodeThreadId({ channelId: "channel-1", rootPostId: "root-1" });
	await adapter.postMessage(threadId, { card });
	const context = posted.props!.attachments[0].actions[0].integration.context;
	fetch.mockClear();
	const body = { user_id: "user-1", post_id: "post-1", channel_id: "channel-1", context };
	const request = (value: unknown = body) =>
		new Request(config.callbackUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(value),
		});
	return {
		adapter,
		bot,
		processAction,
		fetch,
		body,
		request,
		card,
		threadId,
		getPosted: () => posted,
	};
}

describe("authenticated callbacks", () => {
	it.each([404, 401, 403, 500])(
		"does not dispatch an unverified post after a %s lookup failure",
		async (status) => {
			const { adapter, request, fetch, processAction } = await setup();
			fetch.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "lookup failed" }), { status }),
			);
			expect((await adapter.handleWebhook(request())).status).toBe(
				status === 404 ? 404 : 502,
			);
			expect(fetch).toHaveBeenCalledOnce();
			expect(processAction).not.toHaveBeenCalled();
		},
	);

	it("does not dispatch an unverified post after a network failure", async () => {
		const { adapter, request, fetch, processAction } = await setup();
		fetch.mockRejectedValueOnce(new Error("offline"));
		expect((await adapter.handleWebhook(request())).status).toBe(502);
		expect(processAction).not.toHaveBeenCalled();
	});
	it("preserves actual SDK callback-token restoration and one-time URL delivery", async () => {
		const { adapter, bot, processAction, body, request, getPosted, threadId, fetch } =
			await setup();
		processAction.mockRestore();
		const onAction = vi.fn();
		bot.onAction("approve", onAction);
		await bot.initialize();
		try {
			await bot.thread(threadId).post({
				card: {
					type: "card",
					children: [
						{
							type: "actions",
							children: [
								{
									type: "button",
									id: "approve",
									label: "Approve",
									value: "original",
									callbackUrl: "https://actions.example.com/approve",
								},
							],
						},
					],
				},
			});
			const context = getPosted().props!.attachments[0].actions[0].integration.context;
			expect(context.action_value).toMatch(/^__cb:[a-f0-9]{16}$/);
			fetch.mockClear();
			expect((await adapter.handleWebhook(request({ ...body, context }))).status).toBe(200);
			expect(onAction).toHaveBeenCalledOnce();
			expect(onAction.mock.calls[0][0].value).toBe("original");
			const callbacks = () =>
				fetch.mock.calls.filter(([url]) => url === "https://actions.example.com/approve");
			expect(callbacks()).toHaveLength(1);
			expect(JSON.parse(callbacks()[0][1]!.body as string)).toMatchObject({
				actionId: "approve",
				value: "original",
			});
			await adapter.handleWebhook(request({ ...body, context }));
			expect(callbacks()).toHaveLength(1);
		} finally {
			await bot.shutdown();
		}
	});

	it("rejects a post from another channel even with valid signed channel context", async () => {
		const { adapter, request, body, fetch, processAction } = await setup();
		fetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: "other-post", channel_id: "channel-2" })),
		);
		expect(
			(await adapter.handleWebhook(request({ ...body, post_id: "other-post" }))).status,
		).toBe(401);
		expect(fetch).toHaveBeenCalledOnce();
		expect(processAction).not.toHaveBeenCalled();
	});
	it.each(["yes", "", "__cb:0123456789abcdef"])(
		"round-trips signed button values (%s) without exposing credentials",
		async (value) => {
			const { adapter, processAction, body, request } = await setup({
				type: "button",
				id: "approve",
				label: "Approve",
				value,
			});
			expect(body.context.signature).toMatch(/^[a-f0-9]{64}$/);
			expect(body.context.nonce).toMatch(/^[a-f0-9]{32}$/);
			expect(JSON.stringify(body)).not.toContain(config.callbackSecret);
			const options = { waitUntil: vi.fn() };
			expect((await adapter.handleWebhook(request(), options)).status).toBe(200);
			expect(processAction).toHaveBeenCalledOnce();
			expect(processAction.mock.calls[0][0]).toMatchObject({
				actionId: "approve",
				value,
				user: { userId: "user-1" },
				raw: { context: { action_id: "approve", action_value: value } },
			});
			expect(processAction.mock.calls[0][1]).toBe(options);
			const raw = JSON.stringify(processAction.mock.calls[0][0].raw);
			expect(raw).not.toContain(body.context.signature);
			expect(raw).not.toContain(body.context.nonce);
		},
	);

	it.each([
		{ signature: undefined },
		{ signature: "" },
		{ signature: "0".repeat(64) },
		{ signature: "z".repeat(64) },
		{ action_id: "delete" },
		{ action_value: "no" },
		{ channel_id: "channel-2" },
		{ nonce: "b".repeat(32) },
		{ allowed_values: ["injected"] },
	])("rejects missing or tampered signed context before API calls (%j)", async (changes) => {
		const { adapter, body, request, fetch, processAction } = await setup();
		expect(
			(
				await adapter.handleWebhook(
					request({ ...body, context: { ...body.context, ...changes } }),
				)
			).status,
		).toBe(401);
		expect(fetch).not.toHaveBeenCalled();
		expect(processAction).not.toHaveBeenCalled();
	});

	it("binds signatures to the installation, endpoint and signing secret", async () => {
		const { bot, body, request, fetch, processAction } = await setup();
		for (const changes of [
			{ callbackSecret: "different-test-only-secret-at-least-32-bytes" },
			{ baseUrl: "https://other-mattermost.example.com" },
			{ callbackUrl: "https://other-bot.example.com/webhook" },
		]) {
			const other = new MattermostAdapter({ ...config, ...changes });
			await other.initialize(bot);
			fetch.mockClear();
			expect((await other.handleWebhook(request(body))).status).toBe(401);
			expect(fetch).not.toHaveBeenCalled();
		}
		expect(processAction).not.toHaveBeenCalled();
	});

	it("accepts signed contexts after restarting with the same configuration", async () => {
		const { bot, body, request, processAction } = await setup();
		const restarted = new MattermostAdapter(config);
		await restarted.initialize(bot);
		expect((await restarted.handleWebhook(request(body))).status).toBe(200);
		expect(processAction).toHaveBeenCalledOnce();
	});

	it("validates selected options separately from the signed context", async () => {
		const { adapter, body, request, processAction, fetch } = await setup({
			type: "select",
			id: "color",
			label: "Color",
			options: [{ label: "Red", value: "red" }],
		});
		const valid = { ...body, context: { ...body.context, selected_option: "red" } };
		expect((await adapter.handleWebhook(request(valid))).status).toBe(200);
		expect(processAction.mock.calls[0][0].value).toBe("red");
		processAction.mockClear();
		fetch.mockClear();
		for (const selected_option of [undefined, "", "blue", ["red"]]) {
			expect(
				(
					await adapter.handleWebhook(
						request({ ...body, context: { ...body.context, selected_option } }),
					)
				).status,
			).toBe(400);
		}
		expect(processAction).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("rejects forged channel IDs, malformed identities and selections on buttons", async () => {
		const { adapter, body, request, processAction, fetch } = await setup();
		expect(
			(await adapter.handleWebhook(request({ ...body, channel_id: "channel-2" }))).status,
		).toBe(401);
		for (const changes of [
			{ user_id: "../users/me" },
			{ post_id: "" },
			{ post_id: 42 },
			{ context: { ...body.context, selected_option: "yes" } },
		]) {
			expect((await adapter.handleWebhook(request({ ...body, ...changes }))).status).toBe(
				400,
			);
		}
		expect(processAction).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("rejects malformed JSON, non-object bodies, and non-POST methods", async () => {
		const { adapter, request, fetch, processAction } = await setup();
		for (const body of [null, [], "text", 1]) {
			expect((await adapter.handleWebhook(request(body))).status).toBe(400);
		}
		expect(
			(
				await adapter.handleWebhook(
					new Request(config.callbackUrl, { method: "POST", body: "{" }),
				)
			).status,
		).toBe(400);
		expect((await adapter.handleWebhook(new Request(config.callbackUrl))).status).toBe(405);
		expect(fetch).not.toHaveBeenCalled();
		expect(processAction).not.toHaveBeenCalled();
	});

	it("signs replacement actions when a card is edited", async () => {
		const { adapter, body, card, threadId, getPosted, request } = await setup();
		await adapter.editMessage(threadId, "post-1", { card });
		const context = getPosted().props!.attachments[0].actions[0].integration.context;
		expect(context.nonce).not.toBe(body.context.nonce);
		expect((await adapter.handleWebhook(request({ ...body, context }))).status).toBe(200);
	});
});

it("requires a dedicated secret only for interactive callbacks", () => {
	expect(() => new MattermostAdapter({ ...config, callbackSecret: undefined })).toThrow(
		"callbackSecret",
	);
	expect(() => new MattermostAdapter({ ...config, callbackSecret: "short" })).toThrow(
		"callbackSecret",
	);
	expect(
		() => new MattermostAdapter({ baseUrl: config.baseUrl, botToken: config.botToken }),
	).not.toThrow();
	vi.stubEnv("MATTERMOST_CALLBACK_SECRET", config.callbackSecret);
	expect(() => createMattermostAdapter({ ...config, callbackSecret: undefined })).not.toThrow();
	expect(() => createMattermostAdapter({ ...config, callbackSecret: "" })).toThrow(
		"callbackSecret",
	);
});
