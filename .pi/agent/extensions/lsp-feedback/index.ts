import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditTool, createWriteTool, truncateHead } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StreamMessageReader, StreamMessageWriter, createMessageConnection } from "vscode-jsonrpc/lib/node/main.js";

type Diagnostic = {
  range?: {
    start?: { line?: number; character?: number };
    end?: { line?: number; character?: number };
  };
  severity?: number;
  code?: string | number;
  source?: string;
  message?: string;
};

type FormatterConfig = {
  command: string;
  args: string[];
};

type ServerConfig = {
  name: string;
  command: string;
  args?: string[];
  extensions: string[];
  languageId: string;
  formatter?: FormatterConfig;
};

type FeedbackSummary = {
  text: string;
  status: string;
  severity: "info" | "warning" | "error";
  errors: number;
  warnings: number;
};

const MAX_INLINE_DIAGNOSTICS = 3;
const DIAGNOSTIC_TIMEOUT_MS = 1500;
const STATUS_KEY = "lsp-feedback";
const profileBin = resolve(homedir(), ".nix-profile/bin");
const perUserProfileBin = process.env.USER ? `/etc/profiles/per-user/${process.env.USER}/bin` : undefined;

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return path;
}

function normalizePath(cwd: string, input: string): string {
  const raw = input.startsWith("@") ? input.slice(1) : input;
  const expanded = expandHome(raw);
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

function shortPath(cwd: string, absolutePath: string): string {
  if (absolutePath.startsWith(`${cwd}/`)) return absolutePath.slice(cwd.length + 1);
  return absolutePath;
}

function formatCommandArgs(args: string[], file: string): string[] {
  return args.map((arg) => arg.replaceAll("{file}", file));
}

function commandExists(path: string | undefined): path is string {
  return !!path && existsSync(expandHome(path));
}

function defaultServers(): ServerConfig[] {
  const candidates: ServerConfig[] = [
    {
      name: "nixd",
      command: `${profileBin}/nixd`,
      extensions: [".nix"],
      languageId: "nix",
      formatter: commandExists(`${profileBin}/alejandra`)
        ? { command: `${profileBin}/alejandra`, args: ["{file}"] }
        : undefined,
    },
    {
      name: "bash-language-server",
      command: `${profileBin}/bash-language-server`,
      args: ["start"],
      extensions: [".sh", ".bash"],
      languageId: "shellscript",
      formatter: commandExists(`${profileBin}/shfmt`)
        ? { command: `${profileBin}/shfmt`, args: ["-w", "{file}"] }
        : undefined,
    },
    {
      name: "lua-language-server",
      command: `${profileBin}/lua-language-server`,
      extensions: [".lua"],
      languageId: "lua",
      formatter: commandExists(`${profileBin}/stylua`)
        ? { command: `${profileBin}/stylua`, args: ["{file}"] }
        : undefined,
    },
  ];

  return candidates.filter((server) => commandExists(server.command));
}

function findServer(servers: ServerConfig[], filePath: string): ServerConfig | undefined {
  const extension = extname(filePath).toLowerCase();
  return servers.find((server) => server.extensions.includes(extension));
}

function severityName(severity?: number): string {
  switch (severity) {
    case 1:
      return "E";
    case 2:
      return "W";
    case 3:
      return "I";
    case 4:
      return "H";
    default:
      return "?";
  }
}

function compactMessage(message: string | undefined): string {
  const singleLine = (message ?? "Unknown diagnostic").replace(/\s+/g, " ").trim();
  return singleLine.length > 180 ? `${singleLine.slice(0, 177)}...` : singleLine;
}

function summarizeDiagnostics(fileLabel: string, diagnostics: Diagnostic[]): FeedbackSummary {
  const errors = diagnostics.filter((diag) => diag.severity === 1).length;
  const warnings = diagnostics.filter((diag) => diag.severity === 2).length;
  const severity: "info" | "warning" | "error" = errors > 0 ? "error" : warnings > 0 ? "warning" : "info";

  if (diagnostics.length === 0) {
    return {
      text: `LSP ${fileLabel}: clean`,
      status: "clean",
      severity,
      errors,
      warnings,
    };
  }

  const head = diagnostics.slice(0, MAX_INLINE_DIAGNOSTICS).map((diag) => {
    const line = (diag.range?.start?.line ?? 0) + 1;
    const character = (diag.range?.start?.character ?? 0) + 1;
    const source = diag.source ? ` ${diag.source}` : "";
    const code = diag.code !== undefined ? ` ${String(diag.code)}` : "";
    return `${severityName(diag.severity)} ${line}:${character}${source}${code} ${compactMessage(diag.message)}`;
  });

  const remaining = diagnostics.length - head.length;
  const counts = `${errors} error(s), ${warnings} warning(s), ${diagnostics.length} total`;
  const remainder = remaining > 0 ? `\n… ${remaining} more diagnostic(s)` : "";

  return {
    text: `LSP ${fileLabel}: ${counts}\n${head.join("\n")}${remainder}`,
    status: `${errors}E ${warnings}W`,
    severity,
    errors,
    warnings,
  };
}

function compactStatus(server: ServerConfig, summary: FeedbackSummary): string {
  return summary.errors === 0 && summary.warnings === 0 ? `${server.name} clean` : `${server.name} ${summary.status}`;
}

function buildEnv(): NodeJS.ProcessEnv {
  const pathParts = [profileBin, perUserProfileBin, process.env.PATH].filter(Boolean);
  return {
    ...process.env,
    PATH: pathParts.join(":"),
  };
}

async function runCommand(command: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: buildEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function getPrimaryText(content: Array<{ type: string; text?: string }>): string {
  const firstText = content.find((item) => item.type === "text" && typeof item.text === "string");
  return firstText?.text ?? "";
}

class ManagedLspClient {
  private process?: ChildProcessWithoutNullStreams;
  private connection?: ReturnType<typeof createMessageConnection>;
  private initializePromise?: Promise<void>;
  private openDocuments = new Set<string>();
  private documentVersions = new Map<string, number>();
  private diagnostics = new Map<string, Diagnostic[]>();
  private waiters = new Map<string, Set<(diagnostics: Diagnostic[]) => void>>();

  constructor(private readonly rootDir: string, private readonly server: ServerConfig) {}

  private async start(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;

    this.process = spawn(this.server.command, this.server.args ?? [], {
      cwd: this.rootDir,
      env: buildEnv(),
      stdio: "pipe",
    });

    this.connection = createMessageConnection(
      new StreamMessageReader(this.process.stdout),
      new StreamMessageWriter(this.process.stdin),
    );

    this.connection.onNotification("textDocument/publishDiagnostics", (params: any) => {
      const uri = String(params?.uri ?? "");
      const diagnostics = Array.isArray(params?.diagnostics) ? (params.diagnostics as Diagnostic[]) : [];
      this.diagnostics.set(uri, diagnostics);
      const waiters = this.waiters.get(uri);
      if (waiters) {
        for (const resolve of waiters) resolve(diagnostics);
        this.waiters.delete(uri);
      }
    });

    this.connection.listen();

    this.initializePromise = this.connection
      .sendRequest("initialize", {
        processId: process.pid,
        rootUri: pathToFileURL(this.rootDir).toString(),
        capabilities: {
          textDocument: {
            publishDiagnostics: {
              relatedInformation: true,
            },
          },
        },
        clientInfo: {
          name: "pi-lsp-feedback",
          version: "0.1.0",
        },
      })
      .then(() => {
        this.connection?.sendNotification("initialized", {});
      });

    return this.initializePromise;
  }

  private waitForNextDiagnostics(uri: string): Promise<Diagnostic[]> {
    return new Promise((resolve) => {
      const existing = this.waiters.get(uri) ?? new Set<(diagnostics: Diagnostic[]) => void>();
      this.waiters.set(uri, existing);
      existing.add(resolve);

      setTimeout(() => {
        const waiters = this.waiters.get(uri);
        if (waiters?.has(resolve)) {
          waiters.delete(resolve);
          if (waiters.size === 0) this.waiters.delete(uri);
          resolve(this.diagnostics.get(uri) ?? []);
        }
      }, DIAGNOSTIC_TIMEOUT_MS);
    });
  }

  async syncFile(filePath: string, text: string): Promise<Diagnostic[]> {
    await this.start();
    const uri = pathToFileURL(filePath).toString();
    const nextVersion = (this.documentVersions.get(uri) ?? 0) + 1;
    this.documentVersions.set(uri, nextVersion);
    const waitForDiagnostics = this.waitForNextDiagnostics(uri);

    if (!this.openDocuments.has(uri)) {
      this.connection?.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: this.server.languageId,
          version: nextVersion,
          text,
        },
      });
      this.openDocuments.add(uri);
    } else {
      this.connection?.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: nextVersion },
        contentChanges: [{ text }],
      });
    }

    this.connection?.sendNotification("textDocument/didSave", {
      textDocument: { uri },
      text,
    });

    return waitForDiagnostics;
  }

  async stop(): Promise<void> {
    try {
      await this.connection?.sendRequest("shutdown");
    } catch {
      // ignore
    }

    try {
      this.connection?.sendNotification("exit");
    } catch {
      // ignore
    }

    this.connection?.dispose();
    this.connection = undefined;
    this.initializePromise = undefined;
    this.openDocuments.clear();
    this.documentVersions.clear();
    this.waiters.clear();
    this.diagnostics.clear();

    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = undefined;
  }
}

export default function lspFeedbackExtension(pi: ExtensionAPI) {
  const cwd = process.cwd();
  const servers = defaultServers();
  const clients = new Map<string, ManagedLspClient>();

  const writeTool = createWriteTool(cwd);
  const editTool = createEditTool(cwd);

  const getClient = (server: ServerConfig): ManagedLspClient => {
    const key = `${server.name}:${cwd}`;
    let client = clients.get(key);
    if (!client) {
      client = new ManagedLspClient(cwd, server);
      clients.set(key, client);
    }
    return client;
  };

  const applyFormatter = async (server: ServerConfig, filePath: string): Promise<{ ran: boolean; changed: boolean; error?: string }> => {
    if (!server.formatter) return { ran: false, changed: false };

    let before = "";
    try {
      before = await readFile(filePath, "utf-8");
    } catch (error: any) {
      return { ran: false, changed: false, error: `formatter pre-read failed: ${error.message}` };
    }

    const result = await runCommand(server.formatter.command, formatCommandArgs(server.formatter.args, filePath), cwd);

    if (result.code !== 0) {
      return {
        ran: true,
        changed: false,
        error: (result.stderr || result.stdout || `formatter exited with ${result.code}`).trim(),
      };
    }

    try {
      const after = await readFile(filePath, "utf-8");
      return { ran: true, changed: before !== after };
    } catch (error: any) {
      return { ran: true, changed: false, error: `formatter post-read failed: ${error.message}` };
    }
  };

  const collectFeedback = async (absolutePath: string) => {
    const server = findServer(servers, absolutePath);
    if (!server) return undefined;

    let formatterNote: string | undefined;
    const formatter = await applyFormatter(server, absolutePath);
    if (formatter.error) formatterNote = `Formatter error: ${formatter.error}`;
    else if (formatter.ran && formatter.changed) formatterNote = `Formatted with ${server.formatter?.command.split("/").pop()}`;

    const text = await readFile(absolutePath, "utf-8");
    const diagnostics = await getClient(server).syncFile(absolutePath, text);
    const summary = summarizeDiagnostics(shortPath(cwd, absolutePath), diagnostics);

    return {
      summary,
      diagnostics,
      formatterNote,
      server,
    };
  };

  const appendFeedback = (baseText: string, formatterNote: string | undefined, summary: FeedbackSummary): string => {
    const extra = [formatterNote, summary.text].filter(Boolean).join("\n");
    return extra ? `${baseText}\n${extra}` : baseText;
  };

  pi.on("session_start", async (_event, ctx) => {
    // Stay silent until a supported file is actually touched or checked.
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.on("session_shutdown", async () => {
    await Promise.all([...clients.values()].map((client) => client.stop()));
    clients.clear();
  });

  pi.registerTool({
    ...writeTool,
    async execute(id, params, signal, onUpdate, ctx) {
      const result = await writeTool.execute(id, params, signal, onUpdate);
      const absolutePath = normalizePath(ctx.cwd, params.path);
      const feedback = await collectFeedback(absolutePath).catch((error: any) => ({
        summary: undefined,
        diagnostics: [],
        formatterNote: `LSP feedback failed: ${error.message}`,
      }));

      if (!feedback?.summary) {
        if (feedback?.formatterNote) {
          ctx.ui.notify(feedback.formatterNote, "warning");
          return {
            ...result,
            content: [{ type: "text", text: appendFeedback(getPrimaryText(result.content), feedback.formatterNote, {
              text: "",
              status: "",
              severity: "warning",
              errors: 0,
              warnings: 0,
            }) }],
          };
        }
        return result;
      }

      ctx.ui.setStatus(STATUS_KEY, compactStatus(feedback.server, feedback.summary));
      if (feedback.summary.severity !== "info" || feedback.formatterNote) {
        ctx.ui.notify([feedback.formatterNote, feedback.summary.text].filter(Boolean).join("\n"), feedback.summary.severity);
      }

      return {
        ...result,
        content: [{ type: "text", text: appendFeedback(getPrimaryText(result.content), feedback.formatterNote, feedback.summary) }],
      };
    },
  });

  pi.registerTool({
    ...editTool,
    async execute(id, params, signal, onUpdate, ctx) {
      const result = await editTool.execute(id, params, signal, onUpdate);
      const absolutePath = normalizePath(ctx.cwd, params.path);
      const feedback = await collectFeedback(absolutePath).catch((error: any) => ({
        summary: undefined,
        diagnostics: [],
        formatterNote: `LSP feedback failed: ${error.message}`,
      }));

      if (!feedback?.summary) {
        if (feedback?.formatterNote) {
          ctx.ui.notify(feedback.formatterNote, "warning");
          return {
            ...result,
            content: [{ type: "text", text: appendFeedback(getPrimaryText(result.content), feedback.formatterNote, {
              text: "",
              status: "",
              severity: "warning",
              errors: 0,
              warnings: 0,
            }) }],
          };
        }
        return result;
      }

      ctx.ui.setStatus(STATUS_KEY, compactStatus(feedback.server, feedback.summary));
      if (feedback.summary.severity !== "info" || feedback.formatterNote) {
        ctx.ui.notify([feedback.formatterNote, feedback.summary.text].filter(Boolean).join("\n"), feedback.summary.severity);
      }

      return {
        ...result,
        content: [{ type: "text", text: appendFeedback(getPrimaryText(result.content), feedback.formatterNote, feedback.summary) }],
      };
    },
  });

  pi.registerTool({
    name: "lsp_diagnostics",
    label: "LSP Diagnostics",
    description: "Get current diagnostics for a supported file (.nix, .sh, .bash, .lua). Syncs the file through the local language server and returns a compact report.",
    promptSnippet: "Get current LSP diagnostics for a supported file after edits",
    promptGuidelines: ["Use this tool when you need the current diagnostics for a Nix, shell, or Lua file."],
    parameters: Type.Object({
      path: Type.String({ description: "Path to the file to check" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const absolutePath = normalizePath(ctx.cwd, params.path);
      const feedback = await collectFeedback(absolutePath);
      if (!feedback) {
        return {
          content: [{ type: "text", text: `No configured LSP server for ${params.path}` }],
          details: { supported: false },
        };
      }

      const lines = feedback.diagnostics.map((diag) => {
        const line = (diag.range?.start?.line ?? 0) + 1;
        const character = (diag.range?.start?.character ?? 0) + 1;
        const source = diag.source ? ` ${diag.source}` : "";
        const code = diag.code !== undefined ? ` ${String(diag.code)}` : "";
        return `${severityName(diag.severity)} ${line}:${character}${source}${code} ${compactMessage(diag.message)}`;
      });

      const body = [
        `File: ${shortPath(ctx.cwd, absolutePath)}`,
        feedback.formatterNote,
        feedback.summary.text,
        ...(lines.length > 0 ? [""] : []),
        ...lines,
      ]
        .filter(Boolean)
        .join("\n");
      const truncated = truncateHead(body, { maxLines: 120, maxBytes: 24 * 1024 });
      const text = truncated.truncated ? `${truncated.content}\n\n[Diagnostics truncated. ${feedback.diagnostics.length} total item(s)]` : body;

      ctx.ui.setStatus(STATUS_KEY, compactStatus(feedback.server, feedback.summary));
      return {
        content: [{ type: "text", text }],
        details: {
          server: feedback.server.name,
          diagnostics: feedback.diagnostics,
          formatterNote: feedback.formatterNote,
        },
      };
    },
  });

  pi.registerCommand("lsp-restart", {
    description: "Restart all managed language servers",
    handler: async (_args, ctx) => {
      await Promise.all([...clients.values()].map((client) => client.stop()));
      clients.clear();
      ctx.ui.setStatus(STATUS_KEY, undefined);
      ctx.ui.notify("LSP feedback servers restarted", "info");
    },
  });

  pi.registerCommand("diag", {
    description: "Show compact diagnostics for a supported file: /diag path/to/file",
    handler: async (args, ctx) => {
      const input = args?.trim();
      if (!input) {
        ctx.ui.notify("Usage: /diag path/to/file", "warning");
        return;
      }

      const absolutePath = normalizePath(ctx.cwd, input);
      try {
        const fileStat = await stat(absolutePath);
        if (!fileStat.isFile()) {
          ctx.ui.notify(`Not a file: ${input}`, "warning");
          return;
        }
      } catch (error: any) {
        ctx.ui.notify(`Cannot read ${input}: ${error.message}`, "error");
        return;
      }

      const feedback = await collectFeedback(absolutePath);
      if (!feedback) {
        ctx.ui.notify(`No configured LSP server for ${input}`, "warning");
        return;
      }

      ctx.ui.setStatus(STATUS_KEY, compactStatus(feedback.server, feedback.summary));
      ctx.ui.notify([feedback.formatterNote, feedback.summary.text].filter(Boolean).join("\n"), feedback.summary.severity);
    },
  });
}
