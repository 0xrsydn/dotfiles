# Plan mode extension

Claude Code-style plan mode for pi.

## Features

- `/plan` toggles read-only planning mode
- `Ctrl+Alt+P` toggles plan mode on/off
- `/plan execute` runs the last approved plan in the current session with full tools restored
- `/plan execute fresh` starts a fresh session and carries the approved plan into it for execution
- extracts numbered steps from a `Plan:` section
- tracks progress with `[DONE:n]` markers during execution
- restores your previous active tool set after plan mode ends
- keeps `subagent` available in plan mode when you intentionally want to use helper agents during planning

## Commands

- `/plan`
- `/plan on`
- `/plan off`
- `/plan execute`
- `/plan execute fresh`
- `/plan status`
- `/plan clear`

## Shortcut

- `Ctrl+Alt+P` — toggle plan mode

## Behavior

When plan mode is enabled, pi switches to read-only exploration and asks the model to produce a numbered `Plan:` section.

After planning finishes, the extension shows a chooser so you can:
- execute now
- execute in a fresh session
- send custom feedback / continue discussion
- stay in plan mode

When you execute the plan in the current session, the extension restores your previous tools and asks the model to complete the steps while emitting `[DONE:n]` markers.

If you use `/plan execute fresh`, the extension creates a new session, carries over the approved plan and planner notes, restores the full tool set there, and starts execution in that fresh context.
