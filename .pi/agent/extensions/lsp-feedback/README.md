# pi lsp-feedback

Auto-detected defaults for this machine:

- `.nix` -> `~/.nix-profile/bin/nixd` + `alejandra`
- `.sh`, `.bash` -> `~/.nix-profile/bin/bash-language-server start` + `shfmt -w`
- `.lua` -> `~/.nix-profile/bin/lua-language-server` + `stylua`

## What it does

- Overrides pi `write` and `edit`
- After a file change, optionally formats the file
- Re-syncs the final file content into the language server
- Adds a compact diagnostics summary to tool output
- Shows a compact footer status only after supported LSP activity

## Commands

- `/diag path/to/file` - compact diagnostics for one file
- `/lsp-restart` - restart managed language servers

## Tool

- `lsp_diagnostics` - on-demand diagnostics for supported files

## Notes

- This MVP is intentionally compact and context-efficient.
- It stays silent on startup and only becomes visible after you touch or check a supported file.
- Whole-project diagnostics are not implemented yet.
- If you change this extension, run `/reload` in pi.
