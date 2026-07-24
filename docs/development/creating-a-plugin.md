# Creating a Plugin

New plugins are scaffolded with Grafana's `create-plugin` and reconciled to the monorepo
conventions.

## 1. Write the spec first

```
specs/<feature>/
├── requirements.md   # user stories + acceptance criteria
├── design.md         # architecture, decisions, rationale, invariants
└── tasks.md          # discrete, trackable tasks
```

Spec-driven is a repo convention — freeze the design (and its rationale) before code.

## 2. Scaffold

```bash
# panel plugin
npx @grafana/create-plugin@latest --plugin-type=panel --org-name=staffops
# app plugin
npx @grafana/create-plugin@latest --plugin-type=app --org-name=staffops
```

Place the result in `packages/staffops-<name>-<type>/`. The plugin ID becomes
`staffops-<name>-<type>` (e.g. `staffops-servicemap-panel`,
`staffops-aigent-squad-chat-app`).

## 3. Reconcile to monorepo conventions

- **License → MIT/Apache** to match the repo.
- **Drop the `packageManager` pin** (the workspace manages pnpm).
- Ensure the package participates in the workspace (`packages/*`).
- If the plugin depends on another Grafana app (e.g. the LLM app), declare it in
  `plugin.json`:

  ```json
  "dependencies": {
    "grafanaDependency": ">=12.3.0",
    "plugins": [{ "id": "grafana-llm-app", "type": "app", "name": "Grafana LLM" }]
  }
  ```

## 4. Implement + test

- Keep it **frontend-only** — no Go backend. Delegate secrets/orchestration to existing
  apps (e.g. the Grafana LLM app).
- Ship tests with the code (**≥90% line coverage**). Prefer testing the **contract**
  (public API / behaviour), not the implementation.

## 5. Config page (app plugins)

Expose behaviour knobs via `AppPlugin.addConfigPage()` — persisted in the plugin's
`jsonData`. **Never** put secrets there; those belong in the datasource/app that owns them.

```tsx
export const plugin = new AppPlugin<AppConfigJsonData>()
  .setRootPage(App)
  .addConfigPage({ title: 'Configuration', icon: 'cog', body: AppConfig, id: 'configuration' });
```

## 6. Docs

Add a page under `docs/plugins/<name>/` and wire it into `mkdocs.yml` `nav`. The PR lane
runs `mkdocs build --strict`, so broken nav/links fail the build.
