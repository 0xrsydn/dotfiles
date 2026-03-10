return {
  {
    "folke/lazydev.nvim",
    ft = "lua",
    opts = {
      library = {
        { path = "${3rd}/luv/library", words = { "vim%.uv" } },
      },
    },
  },

  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    config = function()
      -- Nix-first workflow:
      -- - install language servers with nix profile / flake / devShell
      -- - start Neovim from a direnv-loaded shell
      -- - Neovim uses server binaries from PATH only
      local lspconfig = require("lspconfig")
      local util = require("lspconfig.util")

      vim.diagnostic.config({
        severity_sort = true,
        virtual_text = {
          spacing = 2,
          source = "if_many",
        },
        float = { border = "rounded" },
      })

      vim.api.nvim_create_autocmd("LspAttach", {
        group = vim.api.nvim_create_augroup("user-lsp-attach", { clear = true }),
        callback = function(event)
          local map = function(keys, func, desc)
            vim.keymap.set("n", keys, func, { buffer = event.buf, desc = desc })
          end

          map("gd", vim.lsp.buf.definition, "Goto definition")
          map("gD", vim.lsp.buf.declaration, "Goto declaration")
          map("gr", vim.lsp.buf.references, "Goto references")
          map("gi", vim.lsp.buf.implementation, "Goto implementation")
          map("K", vim.lsp.buf.hover, "Hover")
          map("<leader>rn", vim.lsp.buf.rename, "Rename")
          map("<leader>ca", vim.lsp.buf.code_action, "Code action")
          map("<leader>cd", vim.diagnostic.open_float, "Line diagnostics")

          if vim.lsp.inlay_hint then
            map("<leader>uh", function()
              vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({ bufnr = event.buf }), { bufnr = event.buf })
            end, "Toggle inlay hints")
          end
        end,
      })

      local capabilities = vim.lsp.protocol.make_client_capabilities()

      local ok_blink, blink = pcall(require, "blink.cmp")
      if ok_blink then
        capabilities = blink.get_lsp_capabilities(capabilities)
      end

      local missing = {}

      local function setup(server, bin, config)
        config = config or {}
        config.capabilities = vim.tbl_deep_extend("force", capabilities, config.capabilities or {})

        if vim.fn.executable(bin) ~= 1 then
          table.insert(missing, string.format("%s (%s)", server, bin))
          return
        end

        lspconfig[server].setup(config)
      end

      setup("lua_ls", "lua-language-server", {
        cmd = { "lua-language-server" },
        settings = {
          Lua = {
            completion = { callSnippet = "Replace" },
            diagnostics = { globals = { "vim" } },
            telemetry = { enable = false },
            workspace = { checkThirdParty = false },
          },
        },
      })

      setup("nixd", "nixd", {
        cmd = { "nixd" },
      })

      setup("bashls", "bash-language-server", {
        cmd = { "bash-language-server", "start" },
      })

      setup("marksman", "marksman", {
        cmd = { "marksman", "server" },
      })

      setup("ts_ls", "typescript-language-server", {
        cmd = { "typescript-language-server", "--stdio" },
        root_dir = util.root_pattern("tsconfig.json", "jsconfig.json", "package.json", ".git"),
        single_file_support = false,
      })

      setup("gopls", "gopls", {
        cmd = { "gopls" },
        settings = {
          gopls = {
            gofumpt = true,
            analyses = {
              unusedparams = true,
            },
            staticcheck = true,
          },
        },
      })

      setup("rust_analyzer", "rust-analyzer", {
        cmd = { "rust-analyzer" },
        settings = {
          ["rust-analyzer"] = {
            cargo = {
              allFeatures = true,
            },
            checkOnSave = {
              command = "clippy",
            },
          },
        },
      })

      setup("pyright", "pyright-langserver", {
        cmd = { "pyright-langserver", "--stdio" },
        settings = {
          python = {
            analysis = {
              autoSearchPaths = true,
              useLibraryCodeForTypes = true,
              diagnosticMode = "workspace",
            },
          },
        },
      })

      if #missing > 0 and #vim.api.nvim_list_uis() > 0 then
        vim.schedule(function()
          vim.notify(
            "LSP not on PATH (install with Nix):\n- " .. table.concat(missing, "\n- "),
            vim.log.levels.INFO,
            { title = "nvim-lspconfig" }
          )
        end)
      end
    end,
  },
}
