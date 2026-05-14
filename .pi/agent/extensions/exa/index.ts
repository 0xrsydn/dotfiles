import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const EXA_API_BASE = "https://api.exa.ai";

type Json = Record<string, any>;

function getApiKey(): string | undefined {
	if (process.env.EXA_API_KEY?.trim()) return process.env.EXA_API_KEY.trim();
	try {
		const path = join(homedir(), ".pi", "agent", "secrets", "exa.json");
		const data = JSON.parse(readFileSync(path, "utf8"));
		if (typeof data.apiKey === "string" && data.apiKey.trim()) return data.apiKey.trim();
	} catch {}
	return undefined;
}

function missingKeyResult() {
	return {
		isError: true,
		content: [{ type: "text" as const, text: "Missing Exa API key. Set EXA_API_KEY, then restart pi. Fallback: ~/.pi/agent/secrets/exa.json with {\"apiKey\":\"...\"}." }],
		details: { missingApiKey: true },
	};
}

async function exaPost(path: string, body: Json, signal?: AbortSignal) {
	const apiKey = getApiKey();
	if (!apiKey) return { missingKey: true as const };
	const res = await fetch(`${EXA_API_BASE}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json", "x-api-key": apiKey },
		body: JSON.stringify(body),
		signal,
	});
	const text = await res.text();
	let data: any = text;
	try { data = text ? JSON.parse(text) : {}; } catch {}
	if (!res.ok) throw new Error(`Exa API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
	return { data };
}

function trim(s: unknown, max = 1200) {
	if (typeof s !== "string") return "";
	return s.length > max ? `${s.slice(0, max)}…` : s;
}

function statusLines(data: any) {
	const statuses = Array.isArray(data.statuses) ? data.statuses : [];
	const failures = statuses.filter((s: any) => s?.status === "error");
	return failures.length ? `\n\nStatuses/errors:\n${failures.map((s: any) => `- ${s.id || "unknown"}: ${s.error?.tag || "error"}${s.error?.message ? ` (${s.error.message})` : ""}`).join("\n")}` : "";
}

function formatResult(r: any, i: number, maxText = 12000): string {
	const bits = [`${i + 1}. ${r.title || r.url || "Untitled"}`, r.url ? `URL: ${r.url}` : ""];
	if (r.author) bits.push(`Author: ${r.author}`);
	if (r.publishedDate) bits.push(`Published: ${r.publishedDate}`);
	if (Array.isArray(r.highlights) && r.highlights.length) bits.push(`Highlights:\n${r.highlights.map((h: string) => `- ${trim(h, 1000)}`).join("\n")}`);
	if (r.summary) bits.push(`Summary: ${typeof r.summary === "string" ? trim(r.summary, 3000) : JSON.stringify(r.summary, null, 2)}`);
	if (r.text) bits.push(`Text:\n${trim(r.text, maxText)}`);
	if (Array.isArray(r.subpages) && r.subpages.length) bits.push(`Subpages:\n${r.subpages.map((s: any, j: number) => formatResult(s, j, 3000)).join("\n\n")}`);
	if (r.extras?.links?.length) bits.push(`Links:\n${r.extras.links.map((u: string) => `- ${u}`).join("\n")}`);
	if (r.extras?.imageLinks?.length) bits.push(`Image links:\n${r.extras.imageLinks.map((u: string) => `- ${u}`).join("\n")}`);
	return bits.filter(Boolean).join("\n");
}

function formatResponse(data: any) {
	const results = Array.isArray(data.results) ? data.results : [];
	const synthesized = data.output ? `Output:\n${typeof data.output === "string" ? data.output : JSON.stringify(data.output, null, 2)}\n\n` : "";
	if (results.length === 0) return `${synthesized}No Exa results.${statusLines(data)}`;
	return `${synthesized}${results.map((r: any, i: number) => formatResult(r, i)).join("\n\n---\n\n")}${statusLines(data)}`;
}

const SearchType = Type.Union([Type.Literal("auto"), Type.Literal("neural"), Type.Literal("fast"), Type.Literal("instant"), Type.Literal("deep-lite"), Type.Literal("deep"), Type.Literal("deep-reasoning")]);
const Category = Type.Union([Type.Literal("company"), Type.Literal("people"), Type.Literal("research paper"), Type.Literal("news"), Type.Literal("personal site"), Type.Literal("financial report")]);
const Section = Type.Union([Type.Literal("header"), Type.Literal("navigation"), Type.Literal("banner"), Type.Literal("body"), Type.Literal("sidebar"), Type.Literal("footer"), Type.Literal("metadata")]);
const ContentMode = Type.Union([Type.Literal("highlights"), Type.Literal("summary"), Type.Literal("text"), Type.Literal("all"), Type.Literal("none")]);

function applyContentOptions(target: Json, params: any, nested: boolean) {
	const mode = params.content ?? params.mode ?? "highlights";
	const contents: Json = nested ? {} : target;
	if (mode === "text" || mode === "all") {
		contents.text = { maxCharacters: params.maxCharacters ?? 12000 };
		for (const k of ["includeHtmlTags", "verbosity", "includeSections", "excludeSections"] as const) if (params[k] !== undefined) contents.text[k] = params[k];
	}
	if (mode === "highlights" || mode === "all") contents.highlights = params.query || params.maxCharacters ? { query: params.query, maxCharacters: params.maxCharacters } : true;
	if (mode === "summary" || mode === "all") contents.summary = params.query || params.summarySchema ? { query: params.query, schema: params.summarySchema } : true;
	for (const k of ["subpages", "subpageTarget"] as const) if (params[k] !== undefined) contents[k] = params[k];
	if (params.links !== undefined || params.imageLinks !== undefined) contents.extras = { ...(params.links !== undefined ? { links: params.links } : {}), ...(params.imageLinks !== undefined ? { imageLinks: params.imageLinks } : {}) };
	if (params.maxAgeHours !== undefined) contents.maxAgeHours = params.maxAgeHours;
	else if (params.fresh) contents.maxAgeHours = 0;
	if (params.livecrawlTimeout !== undefined) contents.livecrawlTimeout = params.livecrawlTimeout;
	if (nested && mode !== "none") target.contents = contents;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "exa_search",
		label: "Exa Search",
		description: "Search the web with Exa and return LLM-ready results, highlights, summaries, text, or deep synthesized output.",
		promptSnippet: "Search the live web using Exa and return cited LLM-ready results",
		promptGuidelines: ["Use exa_search for current web information, docs, news, comparisons, or facts not present locally.", "Prefer highlights for broad lookup; use exa_fetch for specific URLs. Use deep/deep-reasoning plus outputSchema for research synthesis.", "For grounded code search with URLs/sources, use type='fast' and content='highlights' with a specific coding query; for dense implementation context, prefer exa_code."],
		parameters: Type.Object({
			query: Type.String({ description: "Natural-language search query" }),
			numResults: Type.Optional(Type.Number({ description: "Number of results, 1-100. Default 5." })),
			type: Type.Optional(SearchType), category: Type.Optional(Category), additionalQueries: Type.Optional(Type.Array(Type.String())),
			includeDomains: Type.Optional(Type.Array(Type.String())), excludeDomains: Type.Optional(Type.Array(Type.String())),
			startPublishedDate: Type.Optional(Type.String()), endPublishedDate: Type.Optional(Type.String()), userLocation: Type.Optional(Type.String({ description: "Two-letter ISO country code, e.g. US." })),
			content: Type.Optional(ContentMode), maxCharacters: Type.Optional(Type.Number()), fresh: Type.Optional(Type.Boolean()), maxAgeHours: Type.Optional(Type.Number()), livecrawlTimeout: Type.Optional(Type.Number()),
			systemPrompt: Type.Optional(Type.String()), outputSchema: Type.Optional(Type.Any({ description: "Exa synthesized output schema for deep/auto searches." })),
			subpages: Type.Optional(Type.Number()), subpageTarget: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])), links: Type.Optional(Type.Number()), imageLinks: Type.Optional(Type.Number()),
		}),
		async execute(_id, params, signal) {
			const body: Json = { query: params.query, type: params.type ?? "auto", numResults: params.numResults ?? 5 };
			for (const k of ["category", "additionalQueries", "includeDomains", "excludeDomains", "startPublishedDate", "endPublishedDate", "userLocation", "systemPrompt", "outputSchema"] as const) if (params[k] !== undefined) body[k] = params[k];
			applyContentOptions(body, params, true);
			const result = await exaPost("/search", body, signal);
			if ("missingKey" in result) return missingKeyResult();
			return { content: [{ type: "text", text: formatResponse(result.data) }], details: result.data };
		},
	});

	pi.registerTool({
		name: "exa_fetch",
		label: "Exa Fetch",
		description: "Fetch clean markdown/text, highlights, summaries, subpages, and extracted links for one or more URLs using Exa Contents API.",
		promptSnippet: "Fetch URL contents as clean markdown with Exa",
		promptGuidelines: ["Use exa_fetch when the user provides URLs or after exa_search finds pages that need deeper reading.", "Prefer highlights for token efficiency; use text for deep analysis. Check statuses/errors in the result."],
		parameters: Type.Object({
			urls: Type.Optional(Type.Array(Type.String({ description: "URLs to fetch" }))), ids: Type.Optional(Type.Array(Type.String({ description: "Exa document IDs from search results" }))),
			mode: Type.Optional(Type.Union([Type.Literal("text"), Type.Literal("highlights"), Type.Literal("summary"), Type.Literal("all")], { description: "Default text." })),
			query: Type.Optional(Type.String({ description: "Guidance query for highlights or summary" })), summarySchema: Type.Optional(Type.Any()), maxCharacters: Type.Optional(Type.Number()),
			fresh: Type.Optional(Type.Boolean()), maxAgeHours: Type.Optional(Type.Number()), livecrawlTimeout: Type.Optional(Type.Number()), includeHtmlTags: Type.Optional(Type.Boolean()), verbosity: Type.Optional(Type.Union([Type.Literal("compact"), Type.Literal("standard"), Type.Literal("full")])), includeSections: Type.Optional(Type.Array(Section)), excludeSections: Type.Optional(Type.Array(Section)),
			subpages: Type.Optional(Type.Number()), subpageTarget: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])), links: Type.Optional(Type.Number()), imageLinks: Type.Optional(Type.Number()),
		}),
		async execute(_id, params, signal) {
			const body: Json = {};
			if (params.urls !== undefined) body.urls = params.urls;
			if (params.ids !== undefined) body.ids = params.ids;
			applyContentOptions(body, { ...params, content: params.mode ?? "text" }, false);
			const result = await exaPost("/contents", body, signal);
			if ("missingKey" in result) return missingKeyResult();
			return { content: [{ type: "text", text: formatResponse(result.data) }], details: result.data };
		},
	});

	pi.registerTool({
		name: "exa_code",
		label: "Exa Code",
		description: "Get dense, token-efficient coding context and real code examples from Exa Code for library/API/SDK usage, config updates, setup, and hallucination checks.",
		promptSnippet: "Get relevant real-world code examples and API usage context with Exa Code",
		promptGuidelines: [
			"Use exa_code for coding tasks involving unfamiliar libraries, APIs, SDKs, framework patterns, configuration syntax, or setup steps.",
			"Use exa_code before writing or changing code when exact parameter names, imports, call signatures, or current idioms may matter.",
			"Prefer exa_code over general web search for implementation examples; use exa_search for broader docs/news and exa_fetch for known URLs.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Coding-focused query, e.g. 'Vercel AI SDK streamText tool calling example' or 'Prefect v3 @materialize asset URI syntax'." }),
			tokensNum: Type.Optional(Type.Union([
				Type.Literal("dynamic"),
				Type.Number({ description: "Token budget from 50 to 100000. 5000 is a good default; 10000 for broader context." }),
			], { description: "Response token budget. Default dynamic." })),
		}),
		async execute(_id, params, signal) {
			const body: Json = { query: params.query, tokensNum: params.tokensNum ?? "dynamic" };
			const result = await exaPost("/context", body, signal);
			if ("missingKey" in result) return missingKeyResult();
			const data = result.data;
			const meta = [
				data.resultsCount !== undefined ? `Results: ${data.resultsCount}` : "",
				data.outputTokens !== undefined ? `Output tokens: ${data.outputTokens}` : "",
				data.searchTime !== undefined ? `Search time: ${Math.round(data.searchTime)}ms` : "",
			].filter(Boolean).join(" | ");
			const text = `${meta ? `${meta}\n\n` : ""}${data.response || "No Exa Code context returned."}`;
			return { content: [{ type: "text", text }], details: data };
		},
	});

	pi.registerCommand("exa-key", { description: "Check whether the Exa API key is available to pi", handler: async (_args, ctx) => ctx.ui.notify(getApiKey() ? "Exa API key is available" : "Exa API key is missing; set EXA_API_KEY and restart pi", getApiKey() ? "success" : "error") });
}
