<p align="center">
    <a href="https://github.com/gotify/logo">
        <img height="275px" src="https://raw.githubusercontent.com/gotify/logo/master/gotify-logo.png" />
    </a>
</p>

<h1 align="center">gotify/server cloudflare worker</h1>

## Introduction

> [!WARNING]  
> Vibe coding with Codex, Gemini, and Copilot. This repository has not been
> fully reviewed.

The source code and UI are derived from https://github.com/gotify/server. All
credit goes to them.

## Drawback

- API change may not affect immediately

## Deploy from the Cloudflare dashboard

This project is configured for Cloudflare Workers Builds, so deployment can be
started from the Cloudflare dashboard without local deploy commands or GitHub
Actions.

1. In Cloudflare, open **Workers & Pages** and select **Create application**.
2. Select **Import a repository**, connect the Git provider, and choose this
   repository.
3. Use these build settings:
   - Root directory: leave blank
   - Build command: `pnpm run build`
   - Deploy command: `pnpm run cloudflare:deploy`
   - Non-production branch deploy command: `pnpm run cloudflare:preview`
4. Select **Save and Deploy**.
5. After the first deploy succeeds, open the Worker settings and add the
   runtime secret `GOTIFY_DEFAULT_PASS` in **Variables & Secrets**.
6. Redeploy from the Cloudflare dashboard before opening the app for the first
   time.

D1 and R2 resource identifiers are intentionally omitted from `wrangler.jsonc`.
Wrangler provisions them in the Cloudflare account used by Workers Builds. The
Worker applies the committed D1 migrations automatically before handling app
traffic, so no local D1 migration command is required.

Custom domains should be added from the Worker settings in the Cloudflare
dashboard after the first successful deploy.

## Plugins

- Plugin logic now lives under `plugins/`
- Each plugin is a standalone workspace package that extends `GotifyPlugin`
- Add plugin package dependencies in `package.json`
- Import enabled plugins in `vite.config.ts` and pass them to
  `generateLoadPlugin({ plugins: [...] })`
- `src/worker/gen/load.plugin.ts` is generated from the configured plugin list
  by matching against package dependencies

## Client

<a href="https://www.raycast.com/Lemon/gotify" title="Install gotify Raycast Extension"><img src="https://www.raycast.com/Lemon/gotify/install_button@2x.png?v=1.1" height="64" style="height: 64px;" alt="" /></a>
