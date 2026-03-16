---
description: Set up or optimize the current repository for agent-first development (AGENTS.md, docs structure, progressive disclosure)
---

Set up or optimize the current repository for agent-first development. Based on principles from OpenAI's harness engineering and HumanLayer's CLAUDE.md guide.

Additional user context and constraints:
$ARGUMENTS

Before changing anything:
1. Inspect the repository state first.
2. Compare the repo against the checklist below.
3. Prefer minimal, high-leverage, versioned changes.
4. Preserve useful project-specific guidance instead of replacing it blindly.

## When to Use
- Setting up a new repo for agent-driven development
- Optimizing an existing repo's AGENTS.md / CLAUDE.md
- Restructuring docs for agent legibility

## Core Principles

### 1. AGENTS.md = Table of Contents, Not Encyclopedia
- **Max ~100 lines.** Short, stable entry point.
- Only universally applicable instructions (applies to EVERY task).
- Points to deeper sources of truth — doesn't contain them.
- Domain-specific rules go in sub-files (`docs/`, skills, or scoped AGENTS.md in subdirs).

### 2. Progressive Disclosure
- Agent starts with a small map and is taught where to look next.
- Use nested AGENTS.md files in subdirectories for scoped context.
- Skills for domain-specific workflows (loaded on demand, not always).
- Don't frontload — let the agent discover context as needed.

### 3. Repository = System of Record
- If it's not in the repo, it doesn't exist to the agent.
- Push decisions, architecture, plans, conventions INTO the repo as versioned artifacts.
- No tribal knowledge in Slack, Google Docs, or people's heads.
- Docs are code — they get reviewed, updated, and maintained.

### 4. Agent Legibility First
- Optimize for agent comprehension, not just human readability.
- Favor "boring" tech — composable, stable APIs, well-represented in training data.
- Make the app inspectable: logs, metrics, test output should be agent-parseable.
- Structured formats (JSON, markdown with clear headers) > prose walls.

### 5. Enforce, Don't Instruct
- Invariants via CI/linters > instructions in AGENTS.md.
- Type checks, tests, formatting rules catch mistakes mechanically.
- Agent can run verification itself (`make check`, `npm test`, etc.).
- Instructions the agent can't verify will eventually be ignored.

### 6. Less Instructions = Better Compliance
- LLMs reliably follow ~150-200 instructions max (frontier thinking models).
- Agent harnesses already consume ~50 instructions in system prompt.
- Every instruction in AGENTS.md competes for attention budget.
- When everything is "important," nothing is.

## AGENTS.md Template

```markdown
# AGENTS.md

## Project
<1-2 sentences: what this project is and does>

## Stack
<bullet list of key tech: language, framework, DB, infra>

## Structure
<brief map of key directories and what they contain>

## Development
<how to build, run, test — the essential commands>

## Docs
Detailed documentation lives in `docs/`:
- `docs/ARCHITECTURE.md` — system design, package layering, domain map
- `docs/CONVENTIONS.md` — code style, patterns, naming
- `docs/PLANS.md` — active execution plans and progress
- `docs/DECISIONS.md` — architecture decision records (ADRs)

## Verification
<how to verify changes: test commands, type checks, linters>

## Rules
<only universal, always-applicable rules — keep to <10 items>
```

## docs/ Structure

```
docs/
├── ARCHITECTURE.md    # System design, domain map, package layering
├── CONVENTIONS.md     # Code style, patterns, naming conventions
├── DECISIONS.md       # Architecture Decision Records (ADRs)
├── PLANS.md           # Active plans, completed plans, tech debt
└── <domain>/          # Domain-specific deep docs as needed
```

## AGENTS.md ↔ CLAUDE.md Symlink

Always ensure both files exist so the repo works with any agent harness (Claude Code, OpenCode, Codex, etc.).

**Rules:**
- `AGENTS.md` is the source of truth (canonical file).
- `CLAUDE.md` is a symlink to `AGENTS.md`.
- If only `CLAUDE.md` exists, rename it to `AGENTS.md` and create the symlink.
- If both exist as separate files, merge into `AGENTS.md` and replace `CLAUDE.md` with symlink.
- Add `CLAUDE.md` symlink to git (git tracks symlinks fine).

**Commands:**
```bash
# If AGENTS.md exists but no CLAUDE.md
ln -s AGENTS.md CLAUDE.md

# If only CLAUDE.md exists
mv CLAUDE.md AGENTS.md
ln -s AGENTS.md CLAUDE.md

# Verify
ls -la CLAUDE.md  # should show -> AGENTS.md
```

## Checklist

When initializing or optimizing a repo:

- [ ] AGENTS.md exists and is <100 lines
- [ ] CLAUDE.md is symlinked to AGENTS.md (or vice versa)
- [ ] AGENTS.md contains: project summary, stack, structure map, dev commands, verification
- [ ] Domain-specific instructions are NOT in root AGENTS.md
- [ ] `docs/` directory exists with at minimum ARCHITECTURE.md
- [ ] Verification commands are documented and runnable by agent
- [ ] CI/linters enforce key invariants (not just documented)
- [ ] No critical knowledge lives only outside the repo

## Anti-Patterns
- ❌ Stuffing every possible command into AGENTS.md
- ❌ Adding "hotfix" instructions for one-off behavior issues
- ❌ Instructions that aren't verifiable or enforceable
- ❌ Monolithic instruction files that rot over time
- ❌ Architecture decisions living in chat/docs outside repo

## Sources
- OpenAI: https://openai.com/index/harness-engineering/
- HumanLayer: https://www.humanlayer.dev/blog/writing-a-good-claude-md
