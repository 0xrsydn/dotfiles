---
description: Set up or optimize a large repository or monorepo for agent-first development using hierarchical AGENTS.md files and progressive disclosure
---

Set up or optimize the current repository for agent-first development, assuming it may be a large repo or monorepo. Use hierarchical `AGENTS.md` files only where they add real value. Based on principles from OpenAI's harness engineering and HumanLayer's CLAUDE.md guide.

Additional user context and constraints:
$ARGUMENTS

Before changing anything:
1. Inspect the repository structure first.
2. Identify true subsystem boundaries before proposing nested `AGENTS.md` files.
3. Prefer minimal, high-leverage, versioned changes.
4. Preserve useful project-specific guidance instead of replacing it blindly.
5. Do **not** generate `AGENTS.md` files for every directory.

## When to Use
- Large repositories with multiple domains, apps, services, or packages
- Monorepos with different build/test workflows per subtree
- Repos where one root `AGENTS.md` is too broad to stay short and useful
- Repos that need progressive disclosure for agent context

## Goal
Design an agent-legible documentation layout where:
- the root `AGENTS.md` stays short and repo-wide,
- nested `AGENTS.md` files exist only for meaningful boundaries,
- each nested file contains local rules, commands, and navigation help for that subtree,
- duplication across levels is minimized.

## Core Principles

### 1. Root AGENTS.md Is the Map
- The root `AGENTS.md` should remain a concise project-wide entry point.
- It should describe the repo, major subsystems, shared commands, verification, and where deeper context lives.
- It should point agents toward important subtrees that have their own `AGENTS.md`.

### 2. Nested AGENTS.md Files Are Scoped
Create nested `AGENTS.md` files only when a subtree has at least one of these:
- a distinct purpose or domain boundary,
- different commands or verification workflow,
- different conventions or architectural constraints,
- separate deploy/runtime concerns,
- enough complexity that local guidance reduces confusion.

If a subtree has no distinct guidance, do **not** create a nested `AGENTS.md` there.

### 3. Progressive Disclosure Over Duplication
- Parent files provide broad context.
- Child files add only local context.
- Do not copy the same rules into every nested file.
- Child files should extend or narrow the parent context, not restate it.

### 4. Repository = System of Record
- If a decision matters for agents, put it in the repo.
- Architecture, conventions, plans, and decisions should live in versioned docs.
- Avoid relying on external-only knowledge.

### 5. Enforce, Don’t Instruct
- Put invariants into CI, tests, linters, type checks, and scripts whenever possible.
- Document verification commands the agent can actually run.
- Avoid instructions that cannot be checked mechanically.

### 6. Less Instructions = Better Compliance
- Keep every `AGENTS.md` compact.
- Root file should usually stay under ~100 lines.
- Nested files should be even narrower: only the local rules that matter for that subtree.

## Suggested Hierarchy

Only as needed, not by default:

```text
project/
├── AGENTS.md              # project-wide context and repo map
├── CLAUDE.md -> AGENTS.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONVENTIONS.md
│   ├── DECISIONS.md
│   └── PLANS.md
├── apps/
│   ├── AGENTS.md          # app-layer guidance, if meaningful
│   ├── web/
│   │   └── AGENTS.md      # only if web has distinct workflow/conventions
│   └── api/
│       └── AGENTS.md      # only if api has distinct workflow/conventions
└── packages/
    ├── AGENTS.md          # shared package conventions, if meaningful
    └── design-system/
        └── AGENTS.md      # only if this subtree needs extra local guidance
```

## Heuristics for Where to Add Nested AGENTS.md

Good candidates:
- `apps/`, `services/`, `packages/`, `libs/`
- frontend vs backend boundaries
- infra / deployment / ops directories
- design systems or component libraries
- generated-code boundaries with special rules
- domains with their own test/build/dev commands

Poor candidates:
- shallow folders with no local rules
- directories that only mirror code organization but not workflow differences
- every leaf folder in the tree
- locations where the nested file would just repeat the parent file

## What Each Level Should Contain

### Root `AGENTS.md`
Include:
- project summary
- stack overview
- top-level repo map
- key shared commands
- verification commands
- links to `docs/`
- pointers to nested `AGENTS.md` files where relevant
- only universal repo-wide rules

### Nested `AGENTS.md`
Include only local details such as:
- purpose of that subtree
- important local directories/files
- local dev/build/test commands
- local patterns or constraints
- where to find deeper docs for that subsystem
- any local generated-code or migration rules

Do **not** repeat broad repo-wide guidance unless needed for clarity.

## Recommended Process

1. Inspect the repo structure and tooling.
2. Identify subsystem boundaries that actually justify local guidance.
3. Design the smallest useful hierarchy of `AGENTS.md` files.
4. Create or refine root `AGENTS.md` first.
5. Add nested `AGENTS.md` files only for meaningful subtrees.
6. Add or update `docs/` files for architecture/conventions/decisions as needed.
7. Ensure `CLAUDE.md` exists as a symlink to root `AGENTS.md`.
8. Keep files concise and avoid duplication.

## AGENTS.md ↔ CLAUDE.md Symlink

Always ensure both files exist so the repo works with any agent harness (Claude Code, OpenCode, Codex, etc.).

**Rules:**
- `AGENTS.md` is the source of truth (canonical file).
- `CLAUDE.md` is a symlink to `AGENTS.md`.
- If only `CLAUDE.md` exists, rename it to `AGENTS.md` and create the symlink.
- If both exist as separate files, merge into `AGENTS.md` and replace `CLAUDE.md` with symlink.
- Add `CLAUDE.md` symlink to git (git tracks symlinks fine).

## Checklist

When initializing or optimizing a large repo or monorepo:

- [ ] Root `AGENTS.md` exists and stays short
- [ ] Root `CLAUDE.md` is a symlink to `AGENTS.md`
- [ ] Root file contains only repo-wide guidance
- [ ] Nested `AGENTS.md` files exist only at meaningful subsystem boundaries
- [ ] Nested files add local context instead of duplicating parent guidance
- [ ] `docs/` exists with at least `ARCHITECTURE.md`
- [ ] Verification commands are documented and runnable
- [ ] CI/linters enforce important invariants where possible
- [ ] No critical workflow or architectural knowledge lives only outside the repo

## Anti-Patterns
- ❌ Generating `AGENTS.md` in every directory
- ❌ Repeating the same instructions at root and child levels
- ❌ Putting domain-specific rules into the root file when they only matter in one subtree
- ❌ Creating deep hierarchy without distinct workflow boundaries
- ❌ Letting nested files drift from actual commands and tooling

## Sources
- OpenAI: https://openai.com/index/harness-engineering/
- HumanLayer: https://www.humanlayer.dev/blog/writing-a-good-claude-md
