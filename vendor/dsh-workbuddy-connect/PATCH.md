# Local patches to the vendored copy

The vendored `dsh-workbuddy-connect@0.7.3` is **not byte-identical** to the
published package. Two patches are applied, both in
`lib/host-heartbeat-DpaqHdXw.js`. They are re-applied from the pristine copy by
`make-workbuddy-plugin/verify/patch-vendored.mjs` (in the workspace, outside this
package), with every anchor asserted to match exactly once.

> Upstream released **0.7.9** on 2026-10-19, which contains its own version of
> patch 1 (issue #139). This plugin stays on the pinnned 0.7.3 because upgrading
> changes far more than the chat path and would need a full re-verification; the
> two patches below are the parts of that delta this deployment needs. Upgrading
> wholesale is a reasonable follow-up.

## Patch 1 — the conversation trio (HTTP 400 / 11128)

### What breaks without it

Measured **2026-10-27**:

| Endpoint | Unpatched |
| --- | --- |
| China (`copilot.tencent.com`) | HTTP 200 — works |
| International (`www.workbuddy.ai`) | HTTP 400, `code 11128`, `msg: "request illegal"` |

The body of the 11128 answer:

> Request blocked. Please send it again — *This call failed channel verification,
> possibly because it was not sent from an official client.*

It is not a parameter, model, tool, or token problem: a minimal request with one
`role: user` message and no tools is rejected the same way, and the same
credential reads the catalog and the credit normally.

### What the patch does

Sends the trio WorkBuddy's own client sends:

```
X-Conversation-ID
X-Conversation-Request-ID
X-Conversation-Message-ID
```

Measured requirements, by elimination:

| Added headers | Result |
| --- | --- |
| any one of the three | 400 |
| any two | 400 |
| **all three** | **200** |
| `X-Agent-Type` / `X-Agent-Purpose` / `X-Agent-Intent` | 400 (irrelevant) |

An earlier revision of this patch also sent `X-Request-ID` and **derived** the
ids from the conversation (hash of the opening user message). Both were dropped:

- `X-Request-ID` is not required — the trio alone clears 11128, measured.
- A *derived, conversation-stable* id is actively risky. DSH sub-agents and the
  parent share one conversation but not one tool set; if the gateway relates the
  tool definitions to the conversation id, a second agent sending a different
  tool list under the same id is exactly the shape that would answer
  「工具定义不合规，请新建任务重试」. Upstream 0.7.9 uses **fresh UUIDs per
  request**, and its comment records that the gateway keeps no history keyed by
  the id, so nothing is lost by doing the same.

## Patch 2 — record refused chats

When the upstream refuses a chat, `chatStream` writes
`$DSH_HOME/.workbuddy-chat-failure.json` before returning the error:

```json
{ "at": "…", "region": "global", "model": "…",
  "toolCount": 107, "tools": ["read", "write", "…"],
  "status": 400, "body": "<upstream body, capped at 8 KB>" }
```

Deliberately **no message content**. It exists because a refusal message alone
("工具定义不合规") does not identify the payload that provoked it, and the
request body never reaches any log.

## Patch 3 — daily check-in (China build)

Two methods on `WorkBuddyUpstreamClient`, beside `fetchCredits` because the
upstream serves them from the same billing host and with the same headers:

| Method | Endpoint | Effect |
| --- | --- | --- |
| `fetchCheckinStatus` | `POST /v2/billing/meter/checkin-activity-status` | read-only |
| `claimDailyCheckin` | `POST /v2/billing/meter/daily-checkin` | **grants a real reward** |

Both send `billingHeaders` (bearer + `X-User-Id` / `X-Enterprise-Id` /
`X-Tenant-Id` / `X-Domain`) and an empty `{}` body, and read the usual
`{ code, msg, data }` envelope.

Measured 2026-10-28 on a signed-in China account:

```json
{"active":true,"todayCheckedIn":false,"streakDays":14,"dailyCredit":100,
 "todayCredit":100,"isStreakDay":false,"nextStreakDay":0,
 "streakBonusDays":0,"streakBonusCredit":0,"claimButtonText":"立即领取"}
```

The international build answers the same call with `active: false`, which is why
the plugin offers the row only on the China tab and refuses to claim elsewhere.

`claimDailyCheckin` is reached **only** through a click in the settings page: the
reward is real, so the Host re-reads the status immediately before writing, keeps
one claim in flight per product, and drops the cached credit reading afterwards.

## Patch 4 — the China chat body was never normalized

`prepareInternationalChatBody` calls `prepareChatBody`, which forces `stream`,
rewrites `role: "developer"` to `system`, and flattens an object `tool_choice`.
`prepareCnChatBody` did **only** `dropUnsupportedEffort` — so on the China
endpoint the other three repairs never ran.

Measured 2026-10-29 against a signed-in China account, body sent raw as pi-ai
produces it:

| Body | Before | After |
| --- | --- | --- |
| `role: "developer"` | **400 / 11128** `Illegal API invocation from an unapproved channel` — the page's 「请求被拦截，请重新发送」 | 200 |
| `role: "system"` | 200 | 200 |
| `tool_choice: { type: "auto" }` | **400 / 11101** `cannot unmarshal object into Go struct field Request.tool_choice of type string` | 200 |
| `stream: false` | (also refused by the upstream) | 200, forced to stream |

This one hid for a day because every probe handed `chatStream` a body it had
already run through `prepareChatBody` — the test pre-applied the very
normalization whose absence was the bug. `verify/chat-probe.mjs` now sends raw
bodies, and `verify/developer-role-probe.mjs` keeps the case explicit.

## Verifying after a re-vendor

```sh
node --check vendor/dsh-workbuddy-connect/lib/host-heartbeat-DpaqHdXw.js
grep -c conversationHeaders vendor/dsh-workbuddy-connect/lib/host-heartbeat-DpaqHdXw.js   # 2
grep -c recordChatFailure   vendor/dsh-workbuddy-connect/lib/host-heartbeat-DpaqHdXw.js   # 2
grep -c 'X-Request-ID'      vendor/dsh-workbuddy-connect/lib/host-heartbeat-DpaqHdXw.js   # 0
grep -c 'checkin-activity-status' vendor/dsh-workbuddy-connect/lib/host-heartbeat-DpaqHdXw.js  # 1
grep -c 'daily-checkin'     vendor/dsh-workbuddy-connect/lib/host-heartbeat-DpaqHdXw.js  # 1
# the China path must now normalize, in this order:
sed -n '/function prepareCnChatBody/,/^}/p' vendor/dsh-workbuddy-connect/lib/host-heartbeat-DpaqHdXw.js | grep -c normalize
```

Then send one real chat per product through the plugin's own client and confirm
both answer HTTP 200. **The China endpoint passing is not evidence for the
international one** — before this patch it was exactly the opposite.

## Known upstream refusals that are not plugin bugs

| Code | Meaning | Action |
| --- | --- | --- |
| `11158` | account type cannot use that model | pick another model |
| `11102` | model listed but not provisioned server-side | pick another model |
| `14003` | rate limited | wait |

`claimDailyCheckin` on a day that is already claimed is answered by the Host as
`{ state: "already" }` without a write, so a second click cannot spend a day
twice.
