# Global agent context

## Environment

- This machine has `ssh` and `tailscale` installed.
- The agent can access other machines from here over the Tailscale network when needed.
- If a task needs work on a remote host, the agent may use `ssh` from this machine.
- Prefer non-destructive remote inspection first, and be explicit when commands are being run on a remote machine.
- If the target host or remote command is unclear, ask the user before connecting.

## Version Control

- Prefer Jujutsu (`jj`) as the primary version control interface when a repository supports it.
- Use `jj status` instead of `git status`.
- Use `jj diff` instead of `git diff`.
- Use `jj log` instead of `git log` for history inspection.
- Use `jj describe` to update the current change description instead of creating a Git commit message directly.
- Use `jj new` to start a new change when appropriate.
- Use `jj bookmark` workflows for named refs/branches when needed.
- Treat Git as the colocated backend/plumbing unless the user explicitly asks for Git commands or the repo does not support `jj`.
- Do not run destructive Git commands such as `git reset --hard`, `git checkout`, or `git commit` unless explicitly requested.
- If unsure whether a repo is managed by `jj`, inspect non-destructively first with `jj root`, `jj status`, or by checking for `.jj/`.
