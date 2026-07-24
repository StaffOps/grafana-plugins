# Build & Tooling

## No local SDKs — Docker only

The repo builds through **Node 22 + pnpm inside containers**. No host SDKs are required.

```bash
# Build a single plugin (from repo root)
docker run --rm -v "$PWD:/app" -w /app node:22-slim sh -c '
  corepack enable && corepack prepare pnpm@9 --activate
  pnpm install --no-frozen-lockfile
  pnpm --filter <plugin-name> build
'
```

!!! note "pnpm strict isolation + tslib"
    The scaffolded webpack config is compiled by `ts-node`, which needs `tslib`. Under
    pnpm's strict `node_modules`, point `NODE_PATH` at the hoisted tslib when invoking
    webpack directly:

    ```bash
    export NODE_PATH=/app/node_modules/.pnpm/tslib@2.8.1/node_modules:/app/node_modules
    ./node_modules/.bin/webpack -c ./.config/webpack/webpack.config.ts --env production
    ```

## Workspace scripts

The root `package.json` runs scripts recursively across `packages/*`:

| Script | Purpose |
|--------|---------|
| `build` | Production bundle (`dist/`) with subresource integrity |
| `dev` | Watch-mode build |
| `test` / `test:ci` | Jest unit tests (`test:ci` adds `--coverage`) |
| `typecheck` | `tsc --noEmit` |
| `lint` / `lint:fix` | ESLint |
| `sign` | Sign the plugin for distribution |

## Subresource Integrity (SRI)

Plugins are built with `webpack-subresource-integrity`, so `module.js` carries integrity
hashes for its lazy chunks. **Editing a built `dist/*.js` by hand breaks the hash** and the
browser refuses to load the chunk (`ChunkLoadError`). Always rebuild instead of patching
bundles.

!!! warning "Chunk renumbering + browser cache"
    Adding/removing modules can renumber webpack's lazy chunks (e.g. `590.js` → `152.js`).
    Grafana is an SPA and caches `module.js`; after a rebuild, do a **hard refresh**
    (`Ctrl+Shift+R`) or open an incognito window to pick up the new chunk references.

## Coverage gate

Unit tests enforce **≥90% line coverage** (`test:ci --coverage`). New features ship with
their tests in the same change.

## CI

Each plugin follows the standard GitHub Actions lanes: `build`, `test`, `sast`, `release`,
and `docs` (this site). The docs workflow validates `mkdocs build --strict` on PRs and
deploys to GitHub Pages on push to `main`.
