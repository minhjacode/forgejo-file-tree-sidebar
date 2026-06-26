# Changelog

## 1.2.0 — 2026-06-26

**Pagination for large repositories**

The Forgejo API caps each recursive tree request at 1000 entries. Previously, repos with more than 1000 files were silently truncated. The script now fetches successive pages (1000 entries each) and merges them into a single tree. The safety cap is 20 pages (20,000 entries); a warning banner appears only if that hard limit is reached.

## 1.1.0 — 2026-06-26

**Fix: Compatibility with Forgejo versions enforcing Content Security Policy**

Newer Forgejo versions set a `script-src` CSP header with a per-request nonce. Inline `<script>` tags without a matching `nonce` attribute are blocked by the browser, which in turn causes Forgejo's own JavaScript initialization to fail with the message "Gitea JavaScript code couldn't run correctly, please check your custom templates."

Added `nonce="{{.CspNonce}}"` to the `<script>` tag in `footer.tmpl`. The `{{.CspNonce}}` template variable is provided by Forgejo and carries the server-generated nonce value for the current request.

The userscript (`userscript.user.js`) is unaffected — browser userscript managers inject scripts outside of the page's CSP context.

## 1.0.0 — 2026-05-27

Initial release.
