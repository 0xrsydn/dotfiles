return {
	{
		"catppuccin/nvim",
		name = "catppuccin",
		lazy = false,
		priority = 1000,
		opts = {
			flavour = "mocha",
			integrations = {
				gitsigns = true,
				telescope = true,
				which_key = true,
				cmp = true,
				treesitter = true,
				native_lsp = {
					enabled = true,
				},
			},
		},
		config = function(_, opts)
			require("catppuccin").setup(opts)
			vim.cmd.colorscheme("catppuccin")
		end,
	},

	{ "nvim-tree/nvim-web-devicons", lazy = true },

	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		opts = {},
	},

	{
		"lewis6991/gitsigns.nvim",
		event = { "BufReadPre", "BufNewFile" },
		opts = {
			on_attach = function(buffer)
				local gs = package.loaded.gitsigns
				local map = function(mode, lhs, rhs, desc)
					vim.keymap.set(mode, lhs, rhs, { buffer = buffer, desc = desc })
				end

				map("n", "]h", gs.next_hunk, "Next hunk")
				map("n", "[h", gs.prev_hunk, "Previous hunk")
				map("n", "<leader>gp", gs.preview_hunk, "Preview hunk")
				map("n", "<leader>gr", gs.reset_hunk, "Reset hunk")
				map("n", "<leader>gb", gs.blame_line, "Blame line")
			end,
		},
	},

	{
		"kdheepak/lazygit.nvim",
		cmd = {
			"LazyGit",
			"LazyGitConfig",
			"LazyGitCurrentFile",
			"LazyGitFilter",
			"LazyGitFilterCurrentFile",
		},
		dependencies = {
			"nvim-lua/plenary.nvim",
		},
		keys = {
			{ "<leader>gg", "<cmd>LazyGit<cr>", desc = "Open LazyGit" },
		},
	},

	{
		"numToStr/Comment.nvim",
		event = "VeryLazy",
		opts = {},
	},
}
