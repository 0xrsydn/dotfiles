return {
  {
    "stevearc/conform.nvim",
    event = { "BufWritePre" },
    cmd = { "ConformInfo" },
    keys = {
      {
        "<leader>cf",
        function()
          require("conform").format({ async = true, lsp_fallback = true })
        end,
        mode = { "n", "v" },
        desc = "Format buffer",
      },
    },
    opts = {
      notify_on_error = false,
      format_on_save = function()
        return {
          timeout_ms = 1000,
          lsp_fallback = true,
        }
      end,
      formatters_by_ft = {
        lua = { "stylua" },
        nix = { "alejandra", "nixfmt" },
        sh = { "shfmt" },
        bash = { "shfmt" },
        zsh = { "shfmt" },
        json = { "prettierd", "prettier" },
        yaml = { "prettierd", "prettier" },
        markdown = { "prettierd", "prettier" },
      },
    },
  },
}
