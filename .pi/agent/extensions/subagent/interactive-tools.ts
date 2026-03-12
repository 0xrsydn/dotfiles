import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const AskUserParams = Type.Object({
	mode: Type.Optional(
		StringEnum(["input", "confirm", "select", "editor"] as const, {
			description: "Question mode",
			default: "input",
		}),
	),
	question: Type.String({ description: "Question title to show the user" }),
	message: Type.Optional(Type.String({ description: "Optional body text (confirm mode)" })),
	placeholder: Type.Optional(Type.String({ description: "Placeholder text (input mode)" })),
	options: Type.Optional(Type.Array(Type.String(), { description: "Options (select mode)" })),
	prefill: Type.Optional(Type.String({ description: "Prefilled text (editor mode)" })),
});

function parseToolNames(raw: string | undefined): string[] {
	if (!raw) return [];
	const value = raw.trim();
	if (!value) return [];
	if (value.startsWith("[")) {
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) {
				return parsed.map((entry) => String(entry).trim()).filter(Boolean);
			}
		} catch {
			// ignore invalid JSON and fall back to comma-separated parsing
		}
	}
	return value
		.split(",")
		.map((tool) => tool.trim())
		.filter(Boolean);
}

export default function interactiveTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description:
			"Ask the user an interactive clarification question. Supports input, confirm, select, and editor modes.",
		parameters: AskUserParams,
		promptGuidelines: [
			"Use ask_user only when required information is missing or ambiguous.",
			"Ask one focused question at a time and continue once answered.",
		],
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: ask_user requires an interactive UI." }],
					isError: true,
					details: { mode: params.mode ?? "input", cancelled: true },
				};
			}

			const mode = params.mode ?? "input";

			if (mode === "confirm") {
				const confirmed = await ctx.ui.confirm(params.question, params.message ?? "Please confirm.");
				return {
					content: [{ type: "text", text: `User confirmation: ${confirmed ? "yes" : "no"}` }],
					details: { mode, confirmed },
				};
			}

			if (mode === "select") {
				const options = (params.options ?? []).map((option) => option.trim()).filter(Boolean);
				if (options.length === 0) {
					return {
						content: [{ type: "text", text: "Error: select mode requires a non-empty options array." }],
						isError: true,
						details: { mode, cancelled: true },
					};
				}
				const value = await ctx.ui.select(params.question, options);
				if (value === undefined) {
					return {
						content: [{ type: "text", text: "User cancelled the selection." }],
						details: { mode, cancelled: true },
					};
				}
				return {
					content: [{ type: "text", text: `User selected: ${value}` }],
					details: { mode, value, cancelled: false },
				};
			}

			if (mode === "editor") {
				const value = await ctx.ui.editor(params.question, params.prefill ?? "");
				if (value === undefined) {
					return {
						content: [{ type: "text", text: "User cancelled editor input." }],
						details: { mode, cancelled: true },
					};
				}
				return {
					content: [{ type: "text", text: `User input: ${value}` }],
					details: { mode, value, cancelled: false },
				};
			}

			const value = await ctx.ui.input(params.question, params.placeholder);
			if (value === undefined) {
				return {
					content: [{ type: "text", text: "User cancelled input." }],
					details: { mode: "input", cancelled: true },
				};
			}

			return {
				content: [{ type: "text", text: `User input: ${value}` }],
				details: { mode: "input", value, cancelled: false },
			};
		},
	});

	pi.on("session_start", () => {
		const requestedTools = parseToolNames(process.env.PI_SUBAGENT_TOOLS);
		if (requestedTools.length === 0) return;

		const available = new Set(pi.getAllTools().map((tool) => tool.name));
		const validTools = requestedTools.filter((tool) => available.has(tool));
		if (validTools.length > 0) {
			pi.setActiveTools(validTools);
		}
	});
}
