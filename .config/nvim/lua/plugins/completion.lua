return {
  {
    "saghen/blink.cmp",
    version = "*",
    opts = {
      keymap = {
        preset = "super-tab",
      },
      appearance = {
        nerd_font_variant = "mono",
      },
      completion = {
        accept = {
          auto_brackets = {
            enabled = true,
          },
        },
        documentation = {
          auto_show = false,
        },
        ghost_text = {
          enabled = true,
          show_with_menu = false,
        },
        menu = {
          auto_show = false,
        },
      },
      signature = {
        enabled = true,
      },
      sources = {
        default = { "lsp", "path", "buffer" },
      },
      fuzzy = {
        implementation = "prefer_rust_with_warning",
      },
    },
  },
}
