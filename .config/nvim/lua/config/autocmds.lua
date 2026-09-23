local group = vim.api.nvim_create_augroup("user-autocmds", { clear = true })

vim.api.nvim_create_autocmd("TextYankPost", {
  group = group,
  desc = "Highlight on yank",
  callback = function()
    vim.highlight.on_yank()
  end,
})

-- Prose-friendly buffers: soft-wrap long lines instead of truncating them.
-- markdown notes are authored as one long line per paragraph, and the global
-- `wrap = false` in options.lua makes those lines look "capped" at the edge.
local prose_filetypes = {
  markdown = true,
  text = true,
  gitcommit = true,
}

vim.api.nvim_create_autocmd("FileType", {
  group = group,
  desc = "Soft-wrap prose filetypes, keep code nowrap",
  callback = function(args)
    local prose = prose_filetypes[args.match] == true

    -- Window-local display options.
    vim.wo.wrap = prose
    vim.wo.linebreak = prose
    vim.wo.breakindent = prose
    vim.wo.spell = prose

    -- Line numbers are noise when reading/writing prose.
    vim.wo.number = not prose
    vim.wo.relativenumber = not prose

    if prose then
      -- Never hard-wrap on insert; keep visual wrapping only.
      vim.bo.textwidth = 0
    end
  end,
})
