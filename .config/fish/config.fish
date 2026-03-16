source /usr/share/cachyos-fish-config/cachyos-config.fish

# overwrite greeting
# potentially disabling fastfetch
#function fish_greeting
#    # smth smth
#end
alias dotfiles='git --git-dir=/home/rsydn/.dotfiles/ --work-tree=/home/rsydn'
set -gx PATH ~/.npm-global/bin $PATH
set -gx PATH ~/.npm-global/bin $PATH

if status is-interactive
    direnv hook fish | source
end
fish_add_path /opt/cuda/bin
