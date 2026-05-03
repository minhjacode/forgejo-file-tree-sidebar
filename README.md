---
title: forgejo-file-tree-sidebar
purpose: Adds a GitHub-style file tree sidebar to Forgejo repositories
status: active
---

# forgejo-file-tree-sidebar

Client-side file tree sidebar for Forgejo repositories. Forgejo has no native tree on the file view; this script adds one via OAuth2 and the public API.

The sidebar appears on every repository page, lists the full git tree, highlights the current file, and persists per-repo expand state. It uses Forgejo's CSS variables and Octicon icons, so it follows the active theme including dark mode.

## Installation

Two methods. **Server-side** via `footer.tmpl` deploys the script for every user of the instance. **Userscript** via `userscript.user.js` installs it per browser through Tampermonkey or Violentmonkey. Both methods require an OAuth2 application registered in Forgejo.

### Register an OAuth2 application

Sign in to Forgejo. Open **Settings → Applications → Manage OAuth2 Applications** and click **Create OAuth2 Application**. Set:

- **Application Name**: `File Tree Sidebar`
- **Redirect URI**: `https://YOUR-FORGEJO-DOMAIN/` (Forgejo home URL with trailing slash)
- **Confidential Client**: uncheck

Save. Copy the displayed Client ID.

### Configure token lifetime (optional)

The default access token lifetime is 1 hour. To extend to 3 hours and enable refresh-token rotation, edit `app.ini`:

```ini
[oauth2]
ACCESS_TOKEN_EXPIRATION_TIME = 10800
INVALIDATE_REFRESH_TOKENS = true
```

Restart Forgejo. With `INVALIDATE_REFRESH_TOKENS = true`, a leaked refresh token becomes invalid the next time the legitimate user makes a request.

### Deploy server-side

Replace `REPLACE_WITH_YOUR_CLIENT_ID` in `footer.tmpl` with the Client ID. Place the file at `$FORGEJO_CUSTOM/templates/custom/footer.tmpl`. The path varies by setup:

| Setup | Path |
| --- | --- |
| Cloudron | `/app/data/custom/templates/custom/footer.tmpl` |
| Docker (default) | `/data/gitea/custom/templates/custom/footer.tmpl` |
| Binary or distribution package | `/var/lib/forgejo/custom/templates/custom/footer.tmpl` |

The directory `custom/templates/custom/` (with the doubled `custom`) usually does not exist. Create it. Restart Forgejo.

### Deploy as userscript

Install Violentmonkey or Tampermonkey. Create a new userscript and paste the contents of `userscript.user.js`. Replace `YOUR-FORGEJO-DOMAIN.example.com` in the `@match` line with your Forgejo domain, and replace `REPLACE_WITH_YOUR_CLIENT_ID` in the `OAUTH_CLIENT_ID` constant with the Client ID. Save and visit any repository page.

## Usage

Visit a repository. The sidebar shows a **Sign in** button on first load. Click it. A popup opens with Forgejo's authorization page. Click **Authorize**. The popup closes and the sidebar populates.

Tokens persist via the refresh token. The sidebar loads silently on subsequent visits.

| Action | Result |
| --- | --- |
| Click folder | Expand or collapse |
| Click file | Navigate to file |
| Middle-click file | Open file in new tab |
| `Ctrl`/`Cmd` + click folder | Open folder page in new tab |
| Close icon (top right of sidebar) | Hide sidebar |
| Edge tab on left side of viewport | Show sidebar |
| Sign-out icon (top right of sidebar) | Clear local tokens |

## Configuration

Constants near the top of the script:

```js
const OAUTH_CLIENT_ID = '...';         // OAuth Client ID (required)
const OAUTH_SCOPE = 'read:repository'; // minimum required
const SIDEBAR_WIDTH = 300;             // pixels
const MAX_PER_PAGE = 1000;             // Forgejo API max per request
```

For the userscript, edit the `@match` line in the `==UserScript==` header to your Forgejo domain.

## Security

Read this before deploying server-side for other users.

### Token storage

The access token (1-3 hour lifetime) lives in `sessionStorage`: cleared when the tab closes. The refresh token (30 days by default, configurable via `[oauth2] REFRESH_TOKEN_EXPIRATION_TIME`) lives in `localStorage`: persists across sessions, used to silently obtain new access tokens. Both are JavaScript-readable on the Forgejo origin.

### Why OAuth and not session cookies

Forgejo's API rejects session cookies as anti-CSRF. OAuth is the supported mechanism for browser-based clients.

### Why OAuth and not a Personal Access Token

OAuth provides short-lived access tokens, automatic refresh, and (with `INVALIDATE_REFRESH_TOKENS = true`) invalidates leaked refresh tokens on the next legitimate use. A Personal Access Token has none of these properties; it is valid until manually revoked.

### Threat model

Realistic risks, ordered by concern:

1. **XSS in Forgejo** — lets an attacker read the refresh token from `localStorage` and access repos with `read:repository` scope until expiry or revocation. Mitigation: enable `INVALIDATE_REFRESH_TOKENS = true`.
2. **Malicious browser extension** — reads both `localStorage` and `sessionStorage`. No client-side storage protects against this. Use only trusted extensions.
3. **Shared computers** — clear local tokens via the sign-out icon before leaving.

### Comparison to session cookie

Forgejo's session cookie is `HttpOnly`. JavaScript cannot read it. A token in `localStorage` is less protected: readable from any JavaScript on the origin. This is unavoidable for OAuth in the browser. The mitigations (refresh-token rotation, short access-token lifetime, minimum scope) reduce the risk; they do not eliminate it.

### Revoking access

In Forgejo: **Settings → Applications → Authorized OAuth2 Applications → Revoke**. This invalidates all tokens issued for the OAuth app. The sign-out icon in the sidebar clears tokens locally only.

### When not to deploy server-side

Multi-tenant instances with varying user threat models, or instances handling especially sensitive code where the additional XSS attack surface is unacceptable. In these cases, use the userscript variant — each user opts in individually.

## Limitations

Only the first 1000 entries of the git tree load per request (Forgejo API maximum). Larger repos render a partial tree with a warning banner. Submodules and symlinks render as files, not specially marked. There is no file search or filter.

The sidebar appears only on repository file and folder pages. Wiki, packages, releases, and settings pages are out of scope. The script reruns on each page navigation because Forgejo uses full page loads; SPA-style HTMX navigation would require a `popstate` listener.

## Compatibility

Tested on Forgejo v15.x. Behavior on earlier versions is unverified.

Untested on Gitea. Gitea ≥ 1.24 has a native file tree, so this script is unnecessary there.

Requires `crypto.subtle` for PKCE. HTTPS is mandatory. All current desktop and mobile browsers support this.

## Troubleshooting

Open browser DevTools → Console. The script logs errors prefixed with `[ftree]`.

| Symptom | Cause |
| --- | --- |
| "Popup blocked" | Allow popups for the Forgejo domain in browser settings |
| "OAUTH_CLIENT_ID not configured" | Placeholder not replaced |
| Sidebar shows but `API 401 on ...` | OAuth app misconfigured. Check Redirect URI matches exactly, including trailing slash |
| Sidebar shows but `API 404 on /repos/...` | Token has wrong scope, or repo path parsing failed. Inspect the console output |
| Sidebar does not appear | Template not loaded. Verify path includes `custom/templates/custom/` and Forgejo was restarted |

## Development

`footer.tmpl` and `userscript.user.js` share the same script body. The `footer.tmpl` wraps it in `<script>` tags; the `userscript.user.js` wraps it in a `// ==UserScript==` metadata block with `@match`. Keep them in sync when editing.

## Status

Workaround until Forgejo adds a native file tree to the file view. Gitea added this in v1.24 ([PR #32721](https://github.com/go-gitea/gitea/pull/32721)); when Forgejo ports or implements an equivalent, this script becomes obsolete.

Maintenance is best-effort. Bug reports are welcome. Feature requests are handled as time permits.

## License

MIT. See [`LICENSE`](./LICENSE).
