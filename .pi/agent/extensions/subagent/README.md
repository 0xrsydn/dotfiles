# Subagent roles for pi

Installed roles:

- `reviewer` — review changes, bugs, risks, maintainability
- `librarian` — explore and map a codebase
- `uiux-designer` — UI/UX design direction, flows, states, and implementation guidance

## Commands

- `/subagents` — list discovered user-level agents
- `/subagents both` — include project-local `.pi/agents`

## Example prompts

- `Use the subagent tool with reviewer to inspect the auth refactor.`
- `Use subagent in parallel: librarian maps the settings flow, uiux-designer proposes an improved UX direction, reviewer lists product and implementation risks.`
- `Chain librarian -> uiux-designer to redesign onboarding. Use {previous} in the second task.`

## Notes

- User agents live in `~/.pi/agent/agents`
- Project-local agents can live in `.pi/agents`
- Project agents require `agentScope: "project"` or `"both"`
- Parallel mode allows up to 8 tasks and runs up to 4 concurrently
- `reviewer` uses `openai-codex/gpt-5.4:xhigh`
- `librarian` uses `anthropic/claude-sonnet-4-6`
- `uiux-designer` uses `google-antigravity/gemini-3.1-pro-high`
