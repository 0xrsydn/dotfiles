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
      --
      -- Uses the Neovim 0.11+ `vim.lsp.config` / `vim.lsp.enable` API.
      -- nvim-lspconfig ships the per-server defaults in its `lsp/` directory,
      -- which `vim.lsp.config(name, ...)` deep-merges over.

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

      -- Applied to every server. Per-server `config` below is deep-merged in.
      vim.lsp.config("*", { capabilities = capabilities })

      -- `bin` is only used to check PATH; `config` is passed to vim.lsp.config.
      local servers = {
        lua_ls = {
          bin = "lua-language-server",
          config = {
            settings = {
              Lua = {
                completion = { callSnippet = "Replace" },
                diagnostics = { globals = { "vim" } },
                telemetry = { enable = false },
                workspace = { checkThirdParty = false },
              },
            },
          },
        },
        nixd = { bin = "nixd" },
        bashls = { bin = "bash-language-server" },
        marksman = { bin = "marksman" },
        ts_ls = { bin = "typescript-language-server" },
        gopls = {
          bin = "gopls",
          config = {
            settings = {
              gopls = {
                gofumpt = true,
                analyses = {
                  unusedparams = true,
                },
                staticcheck = true,
              },
            },
          },
        },
        rust_analyzer = {
          bin = "rust-analyzer",
          config = {
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
          },
        },
        pyright = {
          bin = "pyright-langserver",
          config = {
            settings = {
              python = {
                analysis = {
                  autoSearchPaths = true,
                  useLibraryCodeForTypes = true,
                  diagnosticMode = "workspace",
                },
              },
            },
          },
        },
      }

      local missing = {}
      local enabled = {}

      for name, spec in pairs(servers) do
        if vim.fn.executable(spec.bin) ~= 1 then
          table.insert(missing, string.format("%s (%s)", name, spec.bin))
        else
          vim.lsp.config(name, spec.config or {})
          table.insert(enabled, name)
        end
      end

      if #enabled > 0 then
        vim.lsp.enable(enabled)
      end

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
