return {
  {
    "stevearc/oil.nvim",
    cmd = "Oil",
    keys = {
      {
        "-",
        "<cmd>Oil<cr>",
        desc = "Open parent directory",
      },
      {
        "<leader>e",
        function()
          require("oil").toggle_float()
        end,
        desc = "Explorer (Oil)",
      },
    },
    dependencies = {
      "nvim-tree/nvim-web-devicons",
    },
    opts = {
      default_file_explorer = true,
      columns = {
        "icon",
      },
      delete_to_trash = false,
      skip_confirm_for_simple_edits = true,
      view_options = {
        show_hidden = true,
      },
      float = {
        padding = 2,
        max_width = 90,
        max_height = 0,
        border = "rounded",
      },
      keymaps = {
        ["<C-v>"] = { "actions.select", opts = { vertical = true } },
        ["<C-s>"] = { "actions.select", opts = { horizontal = true } },
        ["<C-p>"] = "actions.preview",
        ["<Esc>"] = "actions.close",
      },
    },
  },
}
