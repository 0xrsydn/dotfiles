return {
  {
    "nvim-lualine/lualine.nvim",
    event = "VeryLazy",
    dependencies = {
      "nvim-tree/nvim-web-devicons",
    },
    opts = {
      options = {
        theme = "catppuccin",
        globalstatus = true,
        section_separators = "",
        component_separators = "│",
        disabled_filetypes = {
          statusline = { "oil" },
        },
      },
      sections = {
        lualine_a = { "mode" },
        lualine_b = { "branch", "diff", "diagnostics" },
        lualine_c = {
          {
            "filename",
            path = 1,
          },
        },
        lualine_x = {
          {
            "lsp_status",
            ignore_lsp = { "copilot" },
          },
          "encoding",
          "filetype",
        },
        lualine_y = { "progress" },
        lualine_z = { "location" },
      },
      extensions = { "quickfix", "lazy" },
    },
  },
}
