import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AgentConfig } from "./agents.js";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.js";
import {
	applyAssistantUsage,
	createEmptyUsageStats,
	getFinalOutput,
	type OnUpdateCallback,
	type SingleResult,
	type SubagentDetails,
} from "./subagent-types.js";

interface RpcResponse {
	type: "response";
	id?: string;
	command: string;
	success: boolean;
	error?: string;
}

interface PendingRequest {
	resolve: (response: RpcResponse) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
}

type RpcExtensionUIRequest =
	| { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
	| { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
	| { type: "extension_ui_request"; id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
	| { type: "extension_ui_request"; id: string; method: "editor"; title: string; prefill?: string }
	| { type: "extension_ui_request"; id: string; method: "notify"; message: string; notifyType?: "info" | "warning" | "error" }
	| { type: "extension_ui_request"; id: string; method: "setStatus"; statusKey: string; statusText?: string }
	| {
			type: "extension_ui_request";
			id: string;
			method: "setWidget";
			widgetKey: string;
			widgetLines?: string[];
			widgetPlacement?: "aboveEditor" | "belowEditor";
	  }
	| { type: "extension_ui_request"; id: string; method: "setTitle"; title: string }
	| { type: "extension_ui_request"; id: string; method: "set_editor_text"; text: string };

function writePromptToTempFile(agentName: string, prompt: string): { dir: string; filePath: string } {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-rpc-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	fs.writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	return { dir: tmpDir, filePath };
}

function terminateProcess(proc: ReturnType<typeof spawn>): void {
	if (proc.exitCode !== null) return;
	proc.kill("SIGTERM");
	setTimeout(() => {
		if (proc.exitCode === null) proc.kill("SIGKILL");
	}, 3000);
}

function safeJsonParse(line: string): any | undefined {
	if (!line.trim()) return undefined;
	try {
		return JSON.parse(line);
	} catch {
		return undefined;
	}
}

async function bridgeExtensionUiRequest(
	request: RpcExtensionUIRequest,
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
	sendJson: (obj: unknown) => void,
): Promise<void> {
	const sendCancelled = () => sendJson({ type: "extension_ui_response", id: request.id, cancelled: true });

	try {
		switch (request.method) {
			case "select": {
				const value = await ctx.ui.select(request.title, request.options, { signal, timeout: request.timeout });
				if (value === undefined) sendCancelled();
				else sendJson({ type: "extension_ui_response", id: request.id, value });
				return;
			}
			case "confirm": {
				const confirmed = await ctx.ui.confirm(request.title, request.message, { signal, timeout: request.timeout });
				sendJson({ type: "extension_ui_response", id: request.id, confirmed });
				return;
			}
			case "input": {
				const value = await ctx.ui.input(request.title, request.placeholder, { signal, timeout: request.timeout });
				if (value === undefined) sendCancelled();
				else sendJson({ type: "extension_ui_response", id: request.id, value });
				return;
			}
			case "editor": {
				const value = await ctx.ui.editor(request.title, request.prefill ?? "");
				if (value === undefined) sendCancelled();
				else sendJson({ type: "extension_ui_response", id: request.id, value });
				return;
			}
			case "notify":
				ctx.ui.notify(request.message, request.notifyType);
				return;
			case "setStatus":
				ctx.ui.setStatus(request.statusKey, request.statusText);
				return;
			case "setWidget":
				if (request.widgetLines === undefined || Array.isArray(request.widgetLines)) {
					ctx.ui.setWidget(request.widgetKey, request.widgetLines, { placement: request.widgetPlacement });
				}
				return;
			case "setTitle":
				ctx.ui.setTitle(request.title);
				return;
			case "set_editor_text":
				ctx.ui.setEditorText(request.text);
				return;
		}
	} catch {
		if (request.method === "select" || request.method === "confirm" || request.method === "input" || request.method === "editor") {
			sendCancelled();
		}
	}
}

export async function runInteractiveAgentRpc(
	defaultCwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	cwd: string | undefined,
	step: number | undefined,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	ctx: ExtensionContext,
): Promise<SingleResult> {
	const agent = agents.find((entry) => entry.name === agentName);
	if (!agent) {
		const available = agents.map((entry) => `"${entry.name}"`).join(", ") || "none";
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
			usage: createEmptyUsageStats(),
			step,
		};
	}

	const args: string[] = ["--mode", "rpc", "--no-session"];
	if (agent.model) args.push("--model", agent.model);

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;
	if (agent.systemPrompt.trim()) {
		const tmp = writePromptToTempFile(agent.name, agent.systemPrompt);
		tmpPromptDir = tmp.dir;
		tmpPromptPath = tmp.filePath;
		args.push("--append-system-prompt", tmpPromptPath);
	}

	const extensionDir = path.dirname(fileURLToPath(import.meta.url));
	const helperExtensionPath = path.join(extensionDir, "interactive-tools.ts");
	args.push("--extension", helperExtensionPath);

	const env = { ...process.env };
	if (agent.tools && agent.tools.length > 0) {
		env.PI_SUBAGENT_TOOLS = JSON.stringify(agent.tools);
	}

	const currentResult: SingleResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: createEmptyUsageStats(),
		model: agent.model,
		step,
	};

	const emitUpdate = () => {
		if (!onUpdate) return;
		onUpdate({
			content: [{ type: "text", text: getFinalOutput(currentResult.messages) || "(running...)" }],
			details: makeDetails([currentResult]),
		});
	};

	const proc = spawn("pi", args, { cwd: cwd ?? defaultCwd, shell: false, stdio: ["pipe", "pipe", "pipe"], env });
	const pendingRequests = new Map<string, PendingRequest>();
	let requestCount = 0;
	let agentEnded = false;
	let resolveAgentEnd: (() => void) | undefined;
	const agentEndPromise = new Promise<void>((resolve) => {
		resolveAgentEnd = resolve;
	});
	const processExitPromise = new Promise<number>((resolve) => {
		proc.on("close", (code) => {
			if (!agentEnded) resolveAgentEnd?.();
			for (const [id, pending] of pendingRequests.entries()) {
				clearTimeout(pending.timeout);
				pending.reject(new Error(`RPC process exited before response: ${id}`));
			}
			pendingRequests.clear();
			resolve(code ?? 0);
		});
	});
	let wasAborted = false;

	const sendJson = (obj: unknown) => {
		if (proc.stdin.destroyed || proc.stdin.writableEnded) return;
		proc.stdin.write(serializeJsonLine(obj));
	};

	const sendCommand = (command: Record<string, unknown>): Promise<RpcResponse> => {
		const id = `subagent_${++requestCount}`;
		return new Promise<RpcResponse>((resolve, reject) => {
			const timeout = setTimeout(() => {
				pendingRequests.delete(id);
				reject(new Error(`RPC command timed out: ${command.type}`));
			}, 30000);
			pendingRequests.set(id, { resolve, reject, timeout });
			sendJson({ ...command, id });
		});
	};

	const detachStdout = attachJsonlLineReader(proc.stdout, (line) => {
		const event = safeJsonParse(line);
		if (!event) {
			currentResult.stderr += `[rpc] Ignored non-JSON output: ${line}\n`;
			return;
		}

		if (event.type === "response" && event.id && pendingRequests.has(event.id)) {
			const pending = pendingRequests.get(event.id)!;
			pendingRequests.delete(event.id);
			clearTimeout(pending.timeout);
			pending.resolve(event as RpcResponse);
			return;
		}

		if (event.type === "extension_ui_request") {
			void bridgeExtensionUiRequest(event as RpcExtensionUIRequest, ctx, signal, sendJson);
			return;
		}

		if (event.type === "message_end" && event.message) {
			const msg = event.message;
			currentResult.messages.push(msg);
			applyAssistantUsage(currentResult, msg);
			emitUpdate();
			return;
		}

		if (event.type === "agent_end") {
			agentEnded = true;
			resolveAgentEnd?.();
			return;
		}

		if (event.type === "extension_error") {
			const extensionPath = typeof event.extensionPath === "string" ? event.extensionPath : "unknown";
			const error = typeof event.error === "string" ? event.error : "unknown extension error";
			currentResult.stderr += `[extension:${extensionPath}] ${error}\n`;
		}
	});

	proc.stderr.on("data", (data) => {
		currentResult.stderr += data.toString();
	});

	proc.on("error", (error) => {
		currentResult.stderr += `${error.message}\n`;
	});

	const abortHandler = () => {
		wasAborted = true;
		try {
			sendJson({ type: "abort" });
		} catch {}
		terminateProcess(proc);
	};
	if (signal) {
		if (signal.aborted) abortHandler();
		else signal.addEventListener("abort", abortHandler, { once: true });
	}

	try {
		const promptResponse = await sendCommand({ type: "prompt", message: `Task: ${task}` });
		if (!promptResponse.success) {
			currentResult.exitCode = 1;
			currentResult.stderr += `Prompt failed: ${promptResponse.error || "unknown error"}`;
			return currentResult;
		}

		await agentEndPromise;
		if (currentResult.stopReason === "error") currentResult.exitCode = 1;
		if (wasAborted) throw new Error("Subagent was aborted");
		return currentResult;
	} finally {
		detachStdout();
		for (const [id, pending] of pendingRequests.entries()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error(`RPC command interrupted: ${id}`));
		}
		pendingRequests.clear();
		if (signal) signal.removeEventListener("abort", abortHandler);
		terminateProcess(proc);
		const processCode = await processExitPromise;
		if (!wasAborted && currentResult.exitCode === 0 && processCode !== 0 && !agentEnded) {
			currentResult.exitCode = processCode;
		}
		if (tmpPromptPath) {
			try {
				fs.unlinkSync(tmpPromptPath);
			} catch {}
		}
		if (tmpPromptDir) {
			try {
				fs.rmdirSync(tmpPromptDir);
			} catch {}
		}
	}
}
