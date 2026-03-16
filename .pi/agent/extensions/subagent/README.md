# Subagent roles for pi

Installed roles:

- `reviewer` — review changes, bugs, risks, maintainability
- `librarian` — explore and map a codebase
- `design-engineer` — frontend-aware UI/UX direction, design systems, and implementation-ready recommendations
- `executor` — implement ordered coding tasks from a defined todo list
- `planner` — interactive planning specialist that can ask clarifying questions and return an ordered executor-ready todo list

## Commands

- `/subagents` — list discovered user-level agents
- `/subagents both` — include project-local `.pi/agents`

## Example prompts

- `Use the subagent tool with reviewer to inspect the auth refactor.`
- `Use subagent in parallel: librarian maps the settings flow, design-engineer proposes an improved UX direction, reviewer lists product and implementation risks.`
- `Chain librarian -> design-engineer to redesign onboarding. Use {previous} in the second task.`
- `Use executor to implement this ordered todo list exactly as written, then summarize what was completed and validated.`
- `Use planner to clarify ambiguity only when needed and output an ordered implementation todo list for executor handoff.`

## Interactive planner + ask_user

`planner` is marked `interactive: true` and runs through an RPC-backed child agent path.

- Interactive child agents use a helper extension tool: `ask_user`
- `ask_user` supports `input`, `confirm`, and `select` modes (plus `editor`)
- Child tool activation is applied on `session_start` via `PI_SUBAGENT_TOOLS` so custom tools like `ask_user` are reliably active

## Notes

- User agents live in `~/.pi/agent/agents`
- Project-local agents can live in `.pi/agents`
- Project agents require `agentScope: "project"` or `"both"`
- Parallel mode allows up to 8 tasks and runs up to 4 concurrently
- `reviewer` uses `openai-codex/gpt-5.4:xhigh`
- `librarian` uses `anthropic/claude-sonnet-4-6`
- `design-engineer` uses `google-antigravity/gemini-3-flash`
- `executor` uses `openai-codex/gpt-5.3-codex:high`
- `planner` uses `anthropic/claude-sonnet-4-6`

## Current interactive limitations

- Interactive subagents are currently supported only in **single mode** (`{ agent, task }`)
- Interactive subagents are currently rejected in **parallel** and **chain** modes
- Interactive subagents require `ctx.hasUI` (interactive TUI or RPC mode with extension UI handling)
