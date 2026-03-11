import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { extractTodoItems, isSafeCommand, markCompletedSteps, type TodoItem } from "./utils.js";

const PLAN_FLAG = "plan-mode";
const PLAN_TODOS_WIDGET = "plan-todos";
const PLAN_CONTEXT_TYPE = "plan-mode-context";
const PLAN_EXECUTION_CONTEXT_TYPE = "plan-execution-context";
const PLAN_STATE_ENTRY = "plan-mode-state";
const PREFERRED_PLAN_TOOLS = ["read", "bash", "grep", "find", "ls", "lsp_diagnostics", "subagent"];

type PlanModeState = {
	enabled: boolean;
	executing: boolean;
	savedTools: string[] | null;
	todos: TodoItem[];
};

function getAssistantText(message: any): string {
	if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return "";
	return message.content
		.filter((part: any) => part?.type === "text" && typeof part.text === "string")
		.map((part: any) => part.text)
		.join("\n")
		.trim();
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let executionMode = false;
	let savedTools: string[] | null = null;
	let todoItems: TodoItem[] = [];

	function persistState() {
		const state: PlanModeState = {
			enabled: planModeEnabled,
			executing: executionMode,
			savedTools,
			todos: todoItems,
		};
		pi.appendEntry(PLAN_STATE_ENTRY, state);
	}

	function getPlanTools(): string[] {
		const allToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
		const tools = new Set<string>();

		for (const name of PREFERRED_PLAN_TOOLS) {
			if (allToolNames.has(name)) tools.add(name);
		}

		if (savedTools) {
			for (const name of savedTools) {
				if (allToolNames.has(name) && PREFERRED_PLAN_TOOLS.includes(name)) tools.add(name);
			}
		}

		return Array.from(tools);
	}

	function restoreSavedTools() {
		if (savedTools && savedTools.length > 0) {
			pi.setActiveTools(savedTools);
		}
	}

	function updateUi(ctx: ExtensionContext) {
		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((item) => item.completed).length;
			ctx.ui.setStatus(PLAN_FLAG, `📋 ${completed}/${todoItems.length}`);
		} else if (planModeEnabled) {
			ctx.ui.setStatus(PLAN_FLAG, "⏸ PLAN");
		} else {
			ctx.ui.setStatus(PLAN_FLAG, undefined);
		}

		if ((planModeEnabled || executionMode) && todoItems.length > 0) {
			ctx.ui.setWidget(
				PLAN_TODOS_WIDGET,
				todoItems.map((item) => `${item.completed ? "☑" : "☐"} ${item.step}. ${item.text}`),
			);
		} else {
			ctx.ui.setWidget(PLAN_TODOS_WIDGET, undefined);
		}
	}

	function enablePlanMode(ctx: ExtensionContext) {
		if (!savedTools) savedTools = pi.getActiveTools();
		planModeEnabled = true;
		executionMode = false;
		pi.setActiveTools(getPlanTools());
		updateUi(ctx);
		persistState();
		ctx.ui.notify(`Plan mode enabled. Active tools: ${getPlanTools().join(", ")}`, "info");
	}

	function disablePlanMode(ctx: ExtensionContext, notify = true) {
		planModeEnabled = false;
		executionMode = false;
		restoreSavedTools();
		updateUi(ctx);
		persistState();
		if (notify) ctx.ui.notify("Plan mode disabled. Previous tools restored.", "info");
	}

	function clearPlan(ctx: ExtensionContext) {
		executionMode = false;
		todoItems = [];
		updateUi(ctx);
		persistState();
		ctx.ui.notify("Stored plan cleared.", "info");
	}

	function showStatus(ctx: ExtensionContext) {
		if (!planModeEnabled && !executionMode && todoItems.length === 0) {
			ctx.ui.notify("Plan mode is off and no stored plan exists.", "info");
			return;
		}

		const lines = [
			`plan mode: ${planModeEnabled ? "on" : "off"}`,
			`execution: ${executionMode ? "on" : "off"}`,
			`stored steps: ${todoItems.length}`,
		];
		if (todoItems.length > 0) {
			for (const item of todoItems) lines.push(`${item.step}. ${item.completed ? "✓" : "○"} ${item.text}`);
		}
		ctx.ui.notify(lines.join("\n"), "info");
	}

	function getLatestPlannedAssistantText(ctx: ExtensionContext): string {
		const branch = ctx.sessionManager.getBranch();
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry: any = branch[i];
			if (entry?.type !== "message" || !entry.message) continue;
			const text = getAssistantText(entry.message);
			if (text && extractTodoItems(text).length > 0) return text;
		}
		return "";
	}

	function buildExecutionPrompt(ctx: ExtensionContext, fresh: boolean): string {
		const remaining = todoItems.filter((item) => !item.completed);
		const planLines = todoItems.map((item) => `${item.step}. ${item.text}${item.completed ? " [already done]" : ""}`);
		const latestPlanText = getLatestPlannedAssistantText(ctx);
		const sections = [
			fresh
				? "You are executing an approved plan in a fresh session. The earlier planning conversation is not available, so rely only on the context below."
				: "Execute the approved plan in this session.",
			"## Approved Plan",
			planLines.join("\n"),
		];

		if (remaining.length > 0) {
			sections.push("## Remaining Steps", remaining.map((item) => `${item.step}. ${item.text}`).join("\n"));
		}

		if (latestPlanText) {
			sections.push("## Planner Notes", latestPlanText);
		}

		sections.push(
			"## Execution Instructions",
			[
				"Inspect files before editing.",
				"If the approved plan needs adjustment, explain why before making a larger change.",
				"Complete the remaining steps in order.",
				"After completing a step, include a [DONE:n] marker in your response.",
			].join("\n"),
		);

		return sections.join("\n\n");
	}

	function startExecution(ctx: ExtensionContext) {
		if (todoItems.length === 0) {
			ctx.ui.notify("No stored plan found. Create one in /plan mode first.", "warning");
			return;
		}

		planModeEnabled = false;
		executionMode = true;
		restoreSavedTools();
		updateUi(ctx);
		persistState();
		ctx.ui.notify("Executing stored plan with full tools restored.", "info");
		pi.sendUserMessage(buildExecutionPrompt(ctx, false));
	}

	async function startFreshExecution(ctx: any) {
		if (todoItems.length === 0) {
			ctx.ui.notify("No stored plan found. Create one in /plan mode first.", "warning");
			return;
		}

		await ctx.waitForIdle();

		const executionPrompt = buildExecutionPrompt(ctx, true);
		const executionTools = savedTools && savedTools.length > 0 ? [...savedTools] : [...pi.getActiveTools()];
		const carriedTodos = todoItems.map((item) => ({ ...item }));
		const parentSession = ctx.sessionManager.getSessionFile();

		const result = await ctx.newSession({
			parentSession,
			setup: async (sm: any) => {
				sm.appendCustomEntry(PLAN_STATE_ENTRY, {
					enabled: false,
					executing: true,
					savedTools: executionTools,
					todos: carriedTodos,
				});
			},
		});

		if (result.cancelled) {
			ctx.ui.notify("Fresh execution session cancelled.", "info");
			return;
		}

		pi.sendUserMessage(executionPrompt);
	}

	pi.registerFlag("plan", {
		description: "Start in read-only plan mode",
		type: "boolean",
		default: false,
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode, or use /plan on|off|execute [fresh]|status|clear",
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();
			switch (action) {
				case "":
				case "toggle":
					if (planModeEnabled) disablePlanMode(ctx);
					else enablePlanMode(ctx);
					return;
				case "on":
					enablePlanMode(ctx);
					return;
				case "off":
					disablePlanMode(ctx);
					return;
				case "execute":
					startExecution(ctx);
					return;
				case "execute fresh":
					await startFreshExecution(ctx);
					return;
				case "status":
					showStatus(ctx);
					return;
				case "clear":
					clearPlan(ctx);
					return;
				default:
					ctx.ui.notify("Usage: /plan [on|off|execute|execute fresh|status|clear]", "warning");
			}
		},
	});

	pi.registerShortcut("ctrl+alt+p", {
		description: "Toggle plan mode on/off",
		handler: async (ctx) => {
			if (planModeEnabled) disablePlanMode(ctx);
			else enablePlanMode(ctx);
		},
	});

	pi.on("tool_call", async (event) => {
		if (!planModeEnabled) return;

		if (event.toolName === "edit" || event.toolName === "write") {
			return { block: true, reason: "Plan mode is read-only. Disable it before modifying files." };
		}

		if (event.toolName === "bash") {
			const command = typeof event.input?.command === "string" ? event.input.command : "";
			if (!isSafeCommand(command)) {
				return {
					block: true,
					reason: `Plan mode blocked a non read-only bash command: ${command}`,
				};
			}
		}

	});

	pi.on("context", async (event) => {
		if (planModeEnabled || executionMode) return;
		return {
			messages: event.messages.filter((message: any) => {
				if (message?.customType === PLAN_CONTEXT_TYPE) return false;
				if (message?.customType === PLAN_EXECUTION_CONTEXT_TYPE) return false;
				return true;
			}),
		};
	});

	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			return {
				message: {
					customType: PLAN_CONTEXT_TYPE,
					display: false,
					content: `[PLAN MODE ACTIVE]\nYou are in read-only planning mode.\n\nRules:\n- Do not modify files.\n- Do not use edit or write.\n- Use only read-only investigation.\n- You may use subagent when it helps planning. Prefer read-only helpers like librarian, reviewer, or uiux-designer when appropriate.\n- If requirements are unclear, ask clarifying questions before planning.\n- Produce a numbered plan under a \"Plan:\" header.\n- Call out risks, dependencies, and validation steps.`,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((item) => !item.completed);
			return {
				message: {
					customType: PLAN_EXECUTION_CONTEXT_TYPE,
					display: false,
					content:
						`[EXECUTING APPROVED PLAN]\nComplete the remaining plan steps in order.\n\nRemaining steps:\n${remaining.map((item) => `${item.step}. ${item.text}`).join("\n")}\n\nAfter completing a step, include [DONE:n] in your response.`,
				},
			};
		}
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!executionMode || todoItems.length === 0) return;
		const text = getAssistantText(event.message);
		if (!text) return;
		if (markCompletedSteps(text, todoItems) > 0) {
			updateUi(ctx);
			persistState();
		}
		if (todoItems.length > 0 && todoItems.every((item) => item.completed)) {
			executionMode = false;
			updateUi(ctx);
			persistState();
			ctx.ui.notify("Plan execution completed.", "success");
		}
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!planModeEnabled) return;
		const lastAssistant = [...event.messages].reverse().find((message: any) => message?.role === "assistant");
		const text = getAssistantText(lastAssistant);
		if (!text) return;

		const extracted = extractTodoItems(text);
		if (extracted.length === 0) return;

		todoItems = extracted;
		updateUi(ctx);
		persistState();

		if (!ctx.hasUI) return;

		const choice = await ctx.ui.select("Plan ready - what next?", [
			"Execute the plan now",
			"Execute in a fresh session",
			"Send custom feedback / continue discussion",
			"Stay in plan mode",
		]);

		if (choice === "Execute the plan now") {
			startExecution(ctx);
			return;
		}

		if (choice === "Execute in a fresh session") {
			await startFreshExecution(ctx);
			return;
		}

		if (choice === "Send custom feedback / continue discussion") {
			const feedback = await ctx.ui.editor(
				"What should Pi do next?",
				"Refine the plan by ...",
			);
			if (feedback?.trim()) {
				pi.sendUserMessage(feedback.trim());
			}
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		const branch = ctx.sessionManager.getBranch();
		const stateEntry = branch
			.filter((entry: any) => entry.type === "custom" && entry.customType === PLAN_STATE_ENTRY)
			.pop() as { data?: PlanModeState } | undefined;

		if (stateEntry?.data) {
			planModeEnabled = stateEntry.data.enabled ?? false;
			executionMode = stateEntry.data.executing ?? false;
			savedTools = stateEntry.data.savedTools ?? null;
			todoItems = stateEntry.data.todos ?? [];
		} else if (pi.getFlag("--plan") === true || pi.getFlag("plan") === true) {
			planModeEnabled = true;
			executionMode = false;
			savedTools = pi.getActiveTools();
		}

		if (!savedTools) savedTools = pi.getActiveTools();

		if (planModeEnabled) {
			pi.setActiveTools(getPlanTools());
		} else if (executionMode) {
			restoreSavedTools();
		}

		updateUi(ctx);
	});
}
