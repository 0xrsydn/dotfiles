# ─────────────────────────────────────────────────────────────────────────────
# Local sops secret vault → environment
#
#   vault: ~/.secrets/env.enc.env        (dotenv, age-encrypted)
#   key:   ~/.config/sops/age/keys.txt   (auto-discovered by sops)
#   rules: ~/.secrets/.sops.yaml         (recipients for new/edited files)
#
# Sourced automatically by fish. The `secrets` helper is always defined; the
# env-var import below only runs for interactive shells.
# ─────────────────────────────────────────────────────────────────────────────

# Convenience: edit the vault (decrypt → $EDITOR → re-encrypt).
# Defined unconditionally so `fish -c secrets` works too.
function secrets --description 'Edit the local sops secret vault'
    set -l __file $argv[1]
    test -n "$__file"; or set __file $HOME/.secrets/env.enc.env
    sops --config $HOME/.secrets/.sops.yaml $__file
end

# Everything below only runs for interactive shells: non-interactive
# `fish -c ...` shouldn't pay the decrypt cost.
status is-interactive; or return

# Let `sops edit <vaultfile>` work from any directory (config discovery is
# CWD-based, so we point it at the vault explicitly). Not a secret.
set -q SOPS_CONFIG; or set -gx SOPS_CONFIG $HOME/.secrets/.sops.yaml

set -l __vault $HOME/.secrets/env.enc.env
test -f $__vault; or return

set -l __raw (sops --decrypt $__vault 2>/dev/null)

if test -z "$__raw"
    echo "secrets: could not decrypt $__vault (age key missing or keyring locked?)" >&2
    return
end

for __line in $__raw
    # dotenv lines are `KEY=value`; skip anything that isn't.
    if string match -qr '^[A-Za-z_][A-Za-z0-9_]*=' -- $__line
        set -gx (string split -m1 = -- $__line)
    end
end
