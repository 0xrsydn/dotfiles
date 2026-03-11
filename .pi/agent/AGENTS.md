# Global agent context

## Environment

- This machine has `ssh` and `tailscale` installed.
- The agent can access other machines from here over the Tailscale network when needed.
- If a task needs work on a remote host, the agent may use `ssh` from this machine.
- Prefer non-destructive remote inspection first, and be explicit when commands are being run on a remote machine.
- If the target host or remote command is unclear, ask the user before connecting.
