# Third-party notices

## dsh-workbuddy-connect 0.7.3

The upstream WorkBuddy protocol implementation is **vendored** under
`vendor/dsh-workbuddy-connect/` rather than declared as a dependency.

- Copyright (c) 2026 Corrine Hu
- License: MIT (`vendor/dsh-workbuddy-connect/LICENSE`)
- Source: <https://github.com/corrinehu/dsh-workbuddy-connect>
- Vendored files: `lib/index.js`, `lib/host-heartbeat-DpaqHdXw.js`
- **Locally patched**: `lib/host-heartbeat-DpaqHdXw.js` is not byte-identical to
  the published 0.7.3 — see `vendor/dsh-workbuddy-connect/PATCH.md` and
  `PROVENANCE.json`. The patch adds the four conversation-id headers the
  WorkBuddy AI endpoint requires; without it that endpoint answers every chat
  with HTTP 400 / code 11128.

Why vendored: this bundle is installed from a local directory, which pnpm links
rather than installs, so a declared dependency is never materialised on the
Host. Vendoring also keeps the pinned revision explicit — the copy is 0.7.3 and
is not updated by a package manager.

What the vendored copy provides, and what this plugin does not reimplement:
the WorkBuddy HTTP client, the model catalog parser, the loopback shim, and the
pi-ai adapter. This plugin contributes the sign-in flow, the settings page, and
the RPC surface.

The vendored code imports these packages from the Harness installation; none of
them is bundled here:

| Package | Version present in this deployment |
| --- | --- |
| `@deepseek-ai/dsh-llm` | 0.2.1-alpha.2 |
| `@deepseek-ai/dsh-llm-pi-ai` | 0.2.1-alpha.2 |
| `@deepseek-ai/dsh-home-paths` | 0.2.1-alpha.2 |
| `@deepseek-ai/dsh-atomic-write` | 0.2.1-alpha.2 |
| `@deepseek-ai/schemastery` | 3.18.5-alpha.1 |
| `@earendil-works/pi-ai` | 1.0.2 |

`dsh-workbuddy-connect` 0.7.3 was built against `@deepseek-ai/dsh-llm@0.2.0-rc.2`
and `@earendil-works/pi-ai@0.87.1`. The import points it uses still exist in the
versions above, but that pairing is not a verified combination: it is a
deliberate, documented risk of this plugin, not a tested guarantee.
