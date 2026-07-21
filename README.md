<p align="center">
  <img width="180" src="./public/static/yume-logo.png" alt="Yume Gotify logo" />
</p>

<h1 align="center">Yume Gotify</h1>

<p align="center">
  A multilingual Gotify-compatible notification service for Cloudflare Workers.
</p>

## Introduction

Yume Gotify provides a Gotify-compatible Worker backend and React web client.
The interface follows the shared Yume visual language with rounded liquid-glass
surfaces, responsive layouts, and coordinated light and dark themes.

> [!WARNING] This project has been developed with assistance from Codex, Gemini,
> and Copilot and has not yet received a complete independent security review.

The server API and parts of the original web interface are derived from
[gotify/server](https://github.com/gotify/server). Credit for the upstream work
belongs to the Gotify contributors.

## Features

- Gotify-compatible applications, clients, messages, users, and WebSocket
  streams
- Cloudflare D1 persistence, R2 application images, and a Durable Object stream
  hub
- Japanese, English, French, Simplified Chinese, and Traditional Chinese
- Automatic language detection plus explicit language selection
- Automatic, light, and dark themes
- Cross-site Yume language and theme synchronization through shared `.yume.zone`
  preference cookies, with local-storage fallback
- Responsive liquid-glass navigation, cards, tables, forms, menus, dialogs, and
  mobile drawers
- Configurable web background image through a Wrangler environment variable
- Workspace-based plugin system

## Local development

Requirements: Node.js and pnpm.

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm test
pnpm run build
pnpm run cf-typegen
```

Run `pnpm run cf-typegen` whenever a binding or `vars` entry changes in
`wrangler.jsonc`. It regenerates `worker-configuration.d.ts` from the active
Wrangler configuration.

## Runtime configuration

Non-secret settings are defined in the `vars` object in `wrangler.jsonc`.
Secrets such as the production administrator password should be stored through
Cloudflare **Variables & Secrets** or `wrangler secret put`, not committed as
plain text.

### Background image

Set `GOTIFY_BACKGROUND_IMAGE_URL` to an absolute HTTP(S) URL or a site-relative
path:

```jsonc
{
  "vars": {
    "GOTIFY_BACKGROUND_IMAGE_URL": "https://www.yume.zone/img/background4.webp"
  }
}
```

The Worker exposes this value through the no-cache `/config` endpoint. The web
client validates it before applying it and falls back to
`/static/yume-background.webp` when the value is empty, invalid, or unavailable.

### CORS origin

`CORS_ALLOW_ORIGIN` controls the `Access-Control-Allow-Origin` response header:

- `""` uses the incoming browser `Origin`, or `*` when no origin is provided.
- `"https://gotify.yume.zone"` fixes browser access to the production site
  origin.
- Only one explicit origin is currently supported; do not use a comma-separated
  list.

CORS is enforced by browsers. Native Gotify clients and command-line clients do
not use browser CORS enforcement.

## Cloudflare deployment

The project is configured for Cloudflare Workers Builds and can be deployed
without a local deployment command or a GitHub Actions workflow.

1. In Cloudflare, open **Workers & Pages** and select **Create application**.
2. Select **Import a repository**, connect the Git provider, and choose this
   repository.
3. Use these build settings:
   - Root directory: leave blank
   - Build command: `pnpm run build`
   - Deploy command: `pnpm run cloudflare:deploy`
   - Non-production branch deploy command: `pnpm run cloudflare:preview`
4. Select **Save and Deploy**.
5. Add `GOTIFY_DEFAULT_PASS` as a secret in **Variables & Secrets** and replace
   the development default before opening the service to users.
6. Redeploy so the secret and runtime variables are available to the Worker.

D1 and R2 resource identifiers are intentionally omitted from `wrangler.jsonc`
so Workers Builds can provision them in the target account. The Worker applies
the committed D1 migrations before handling application traffic.

### Custom-domain-only routing

The committed Wrangler configuration exposes the Worker only through the
`gotify.yume.zone` custom domain:

```jsonc
{
  "workers_dev": false,
  "preview_urls": false,
  "routes": [
    {
      "pattern": "gotify.yume.zone",
      "custom_domain": true
    }
  ]
}
```

The `*.workers.dev` route and version preview URLs are disabled. The custom
domain must belong to the Cloudflare account used for deployment.

## Plugins

- Plugin logic lives under `plugins/`.
- Each plugin is a standalone workspace package extending `GotifyPlugin`.
- Add plugin package dependencies to the root `package.json`.
- Import enabled plugins in `vite.config.ts` and pass them to
  `generateLoadPlugin([...])`.
- `src/worker/gen/load.plugin.ts` is generated from the configured package list.

## Known limitation

- Some API-visible changes may not appear immediately in already-open clients.

## Client

<a href="https://www.raycast.com/Lemon/gotify" title="Install the Gotify Raycast extension"><img src="https://www.raycast.com/Lemon/gotify/install_button@2x.png?v=1.1" height="64" alt="Install Gotify Raycast extension" /></a>
