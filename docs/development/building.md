# Building & Testing

All commands run inside a `node:22` container — the host needs no Node/pnpm.

## Install + build

```bash
docker run --rm -v "$PWD:/app" -w /app node:22-slim sh -c '
  corepack enable && corepack prepare pnpm@9 --activate
  pnpm install --no-frozen-lockfile
  pnpm --filter <plugin-name> build
'
```

## Test with coverage

```bash
docker run --rm -v "$PWD:/app" -w /app/packages/<plugin> node:22-slim sh -c '
  export NODE_PATH=/app/node_modules/.pnpm/tslib@2.8.1/node_modules:/app/node_modules
  export PATH=./node_modules/.bin:$PATH
  jest --coverage
'
```

The coverage gate is **≥90% lines**. Tests live next to the code (`*.test.ts[x]`).

## Direct webpack build (bypassing pnpm filter)

Useful when iterating on one plugin. The scaffolded config is compiled by `ts-node`, which
needs `tslib` on `NODE_PATH` under pnpm's strict isolation:

```bash
docker run --rm -v "$PWD:/app" -w /app/packages/<plugin> node:22-slim sh -c '
  export NODE_PATH=/app/node_modules/.pnpm/tslib@2.8.1/node_modules:/app/node_modules
  export PATH=./node_modules/.bin:$PATH
  webpack -c ./.config/webpack/webpack.config.ts --env production
'
```

## Run a local Grafana with the plugin

Each plugin ships a compose file that mounts its `dist/` into a Grafana container:

```bash
cd packages/<plugin>
docker compose up -d          # or docker-compose.e2e.yaml for the chat app
# open http://localhost:3000
```

!!! warning "Hard refresh after rebuild"
    Grafana is an SPA and caches `module.js`. After rebuilding, do a **hard refresh**
    (`Ctrl+Shift+R`) or use an incognito window, or the browser may load stale/renumbered
    chunks and fail with `ChunkLoadError`.

## Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module 'tslib'` | pnpm strict isolation | Set `NODE_PATH` as above |
| `ChunkLoadError` in the browser | Stale cached `module.js` after rebuild | Hard refresh / incognito |
| Bundle edited by hand won't load | Broken subresource-integrity hash | Rebuild; never patch `dist/*.js` |
| `ERR_PNPM_NO_LOCKFILE` | Building without the workspace lockfile | Install from repo root, or `--no-frozen-lockfile` |
