<p align="center">
  <img width="180" src="./public/static/yume-logo.png" alt="Yume Gotify logo" />
</p>

<h1 align="center">Yume Gotify</h1>

<p align="center">
  A multilingual Gotify 3.x-compatible notification service for Cloudflare Workers.
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
- Gotify 3 session-cookie authentication with HttpOnly, SameSite, Secure
  cookies
- Gotify 3 enhanced Ed25519 application/client tokens (`gtfya.` and `gtfyc.`)
  with private tokens returned only when a resource is created
- OIDC browser login, native PKCE login, OIDC account linking, auto-registration,
  and OIDC session elevation
- iGotify Notification Assistant 1.6.0.0 integration, including `/Version`,
  device registration, realtime notification forwarding, and SecNtfy preview
  payloads
- Cloudflare D1 persistence, R2 application images, and a Durable Object stream
  hub
- Japanese, English, French, Simplified Chinese, and Traditional Chinese
- Automatic language detection plus explicit language selection
- Automatic, light, and dark themes
- Cross-site Yume language and theme synchronization through shared `.yume.zone`
  preference cookies, with local-storage fallback
- Flat functional navigation plus liquid-glass language and theme controls whose
  dropdowns open inline on hover or click without a modal backdrop
- Responsive rounded liquid-glass app bars, cards, tables, forms, menus,
  dialogs, and mobile drawers
- Configurable web background image through a Wrangler environment variable
- Configurable header Logo Bar image through a Wrangler environment variable
- Workspace-based plugin system

## Local development

Requirements: Node.js 22.22+ and pnpm. The current dependency set uses Vite 8,
React Router 8, TypeScript 7, and Wrangler 4.

The committed `.node-version` pins Cloudflare Workers Builds to Node.js 22.22.0
instead of the older build-image default.

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

Run `pnpm run cf-typegen` whenever a binding, `vars`, or `secrets.required` entry changes in
`wrangler.jsonc`. It regenerates `worker-configuration.d.ts` from the active
Wrangler configuration.

## Runtime configuration

Non-secret settings are defined in the `vars` object in `wrangler.jsonc`.
The current configuration declares `GOTIFY_DEFAULTUSER_PASS` and
`GOTIFY_OIDC_CLIENTSECRET` as required Wrangler secrets. They must not be put in
`vars` or committed to the repository.

Set them before deploying:

```bash
pnpm exec wrangler secret put GOTIFY_DEFAULTUSER_PASS
pnpm exec wrangler secret put GOTIFY_OIDC_CLIENTSECRET
```

The OIDC client secret is read at runtime from the Worker secret binding. The
OIDC issuer and client ID are intentionally non-secret configuration values.

`GOTIFY_LOCALAUTH_ENABLED` is a Yume Gotify switch, not an upstream Gotify 3
environment variable. It is `true` in the committed configuration, so password
login and OIDC are both available. Set it to `false` while keeping
`GOTIFY_OIDC_ENABLED=true` to run an OIDC-only login surface.

### Versioned components

The Worker exposes the versions independently so the iGotify client can verify
the assistant contract without confusing it with the Gotify server version:

| Component | Runtime value | Endpoint |
| --- | --- | --- |
| Gotify server | `3.0.0` | `/version` |
| iGotify Notification Assistant | `1.6.0.0` | `/Version` and `/api/version` |

Keep the two values separate when upgrading either component.

### Gotify 3 authentication

Browser login is implemented by `POST /auth/local/login` with HTTP Basic
credentials and a form field named `name`. The Worker returns a Gotify 3
session cookie; the React client never stores an access token in local storage.
Logout uses `POST /auth/logout` and deletes the session client.

`GET /client` and `GET /application` intentionally return no access tokens.
`POST /client` and `POST /application` return the newly generated private token
once. Applications send messages through the authenticated web session using
the `appid` field; external senders use their private `gtfya.` application
token.

Existing pre-3.x `A...`/`C...` tokens are not migrated or accepted. Create new
Gotify 3 clients and applications after upgrading.

### OIDC

Set these `vars` entries in `wrangler.jsonc` (the repository contains the
production placeholders currently used by this project):

```jsonc
{
  "vars": {
    "GOTIFY_LOCALAUTH_ENABLED": "true",
    "GOTIFY_OIDC_ENABLED": "true",
    "GOTIFY_OIDC_ISSUER": "https://account.yume.zone",
    "GOTIFY_OIDC_CLIENTID": "replace-with-client-id",
    "GOTIFY_OIDC_USERNAMECLAIM": "preferred_username",
    "GOTIFY_OIDC_REDIRECTURL": "https://gotify.yume.zone/auth/oidc/callback",
    "GOTIFY_OIDC_AUTOREGISTER": "true",
    "GOTIFY_OIDC_LINK_BY_USERNAME": "false",
    "GOTIFY_OIDC_SCOPES": "openid,profile,email",
    "GOTIFY_OIDC_IDP_NAME": "Yume Account",
    "GOTIFY_OIDC_AUTO_REDIRECT": "false",
    "GOTIFY_OIDC_PROMPT": "login",
    "GOTIFY_SERVER_SECURECOOKIE": "true"
  }
}
```

The browser flow uses `/auth/oidc/login` and `/auth/oidc/callback`. Native
clients use the PKCE endpoints:

- `POST /auth/oidc/external/authorize`
- `POST /auth/oidc/external/token`

The native redirect URI should be `gotify://oidc/callback`, matching the Gotify
3 client contract. Both flows validate the issuer, audience, nonce, expiry,
JWKS signature, and PKCE verifier before creating a client session.

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

### Header Logo Bar

Set `GOTIFY_LOGO_BAR_URL` to an absolute HTTP(S) URL or a site-relative path:

```jsonc
{
  "vars": {
    "GOTIFY_LOGO_BAR_URL": "https://www.yume.zone/assets/img/yumegotify.png"
  }
}
```

The default is the official Yume Gotify Logo Bar at the URL in the example. The
Worker publishes the value through `/config`; the web client validates it before
replacing the bundled default.

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
5. Add `GOTIFY_DEFAULTUSER_PASS` as a secret in **Variables & Secrets** before
   opening the service to users.
6. Add `GOTIFY_OIDC_CLIENTSECRET` as a secret in **Variables & Secrets**.
7. Redeploy so both secrets and runtime variables are available to the Worker.

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

- Upgrading to Gotify 3 intentionally invalidates pre-3.x application and client
  tokens. Recreate those resources and re-register iGotify devices.
- An OIDC provider must expose a standards-compliant discovery document, JWKS,
  authorization endpoint, token endpoint, and ID token claims.

## Client

<a href="https://www.raycast.com/Lemon/gotify" title="Install the Gotify Raycast extension"><img src="https://www.raycast.com/Lemon/gotify/install_button@2x.png?v=1.1" height="64" alt="Install Gotify Raycast extension" /></a>
