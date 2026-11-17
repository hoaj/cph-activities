# Which MCP SDK features can the server rely on, and which clients honour them?

Research for hoaj/cph-activities#22 (child of map #19). Dated 2026-11-17. Primary sources only; every claim has a link in "Sources". Items I could not confirm from a first-party page are marked **unverified** and are never used in the recommendation.

## Short answer

- Build on **stateless Streamable HTTP, POST only**, with tools, `annotations`, `outputSchema` plus `structuredContent`, and server `instructions`. All of it is in the spec and in both SDK lines, and the documented clients (Claude.ai/apps, Claude Code, ChatGPT, Cursor) use tools; Claude and ChatGPT document annotations, and Claude Code and ChatGPT document `instructions`.
- **Do not depend on elicitation.** Claude Code and Cursor document it. Claude's connector docs and OpenAI's MCP docs do not mention it for Claude.ai or ChatGPT. Use a **`needs_input` tool result** in `plan_outing` and let the model ask the user in chat.
- **Prompts** are a nice extra (Claude Code and Cursor surface them; Claude lists them as supported) but not something ChatGPT documents. Do not make any flow need them.
- **Per-person URLs** work in all four clients as "no sign-in" connectors with a secret path segment, but the Claude docs warn against secrets in URLs for credentials and the spec forbids access tokens in the query string, so treat it as a capability URL: secret in the path, never logged, revocable.
- **SDK**: the repo pins `@modelcontextprotocol/sdk` 1.32.1 (v1 line, spec 2025-11-25). The stable line is now v2 (`@modelcontextprotocol/server` 2.4.0, spec 2026-07-28, released 2026-07-27); v1.x gets fixes for at least six months after that. Start the server on v1.32.x (matches the plugin runtime, works with every client today), and keep the tool layer SDK-agnostic so a move to v2 is a transport swap.

## What the repo already does

- `skills/kultunaut/cli/package.json` pins `"@modelcontextprotocol/sdk": "1.32.1"` (also in `bun.lock`), with `express` 5.3.0 and `zod` ^4.6.5. npm's `latest` for the v1 package is 1.32.2.
- `skills/kultunaut/cli/src/runtime/remote.ts` (`mcp --http`) uses the **low-level `Server`** class plus `StreamableHTTPServerTransport`, created **per POST request** with `sessionIdGenerator: undefined` and `enableJsonResponse: true` (stateless, plain JSON replies). `GET /mcp` and `DELETE /mcp` answer 405. It declares `capabilities: { tools: { listChanged: false } }` and passes `instructions`. It also checks `Origin` against `https://claude.ai` plus its own origin, and mounts the SDK's OAuth router with a bearer check (the Owner sign-in). A per-person-URL server would replace the OAuth layer with a link check.
- `skills/kultunaut/cli/src/runtime/mcp.ts` lists tools with `name`, `description`, `inputSchema` (from Zod via `z.toJSONSchema`) and `annotations`. Results carry `content` (JSON text) plus `structuredContent` for objects and `isError` on failures. It does not declare `outputSchema`, prompts or elicitation. Its stdio side lists protocol versions 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05.

## Feature x client table

Legend: yes = documented by the client's vendor; no = documented as unsupported; ? = not mentioned in the vendor docs I could reach (unverified, do not rely on it). "Spec" = defined in the MCP specification.

| Feature | Spec / SDK | Claude.ai, Desktop, mobile (custom connector) | ChatGPT (developer mode / connectors) | Claude Code | Cursor |
|---|---|---|---|---|---|
| Stateless Streamable HTTP (POST only, no `Mcp-Session-Id`) | Spec 2026-07-28 removes sessions and the GET stream; for 2025-11-25 and older, sessions are optional. v1 SDK: `sessionIdGenerator: undefined`. v2: `createMcpHandler` is stateless by default and serves 2025-era clients statelessly too. | yes: "Use Streamable HTTP"; legacy HTTP+SSE also works | yes: Streamable HTTP and SSE listed | yes: HTTP is the recommended remote transport | yes: Streamable HTTP, SSE, stdio |
| Tool annotations (`readOnlyHint`, `destructiveHint`, `title`, ...) | Spec: hints, clients must treat as untrusted unless the server is trusted | yes: every directory tool must have `title` and the applicable hint; they set auto-permissions (read-only runs without per-call confirmation). Custom connectors: assume the same, not stated | yes: `readOnlyHint` respected, tools without it are treated as write and ask for confirmation by default. A community thread reports annotations being ignored in Business: **unverified** | yes: `readOnlyHint` also lets calls run in parallel | ? |
| `outputSchema` + `structuredContent` | Spec: servers MUST conform to a declared `outputSchema`; also return the JSON as a text block. 2026-07-28 allows any JSON value | ? (text and image results are documented; structured content is not mentioned) | yes: "declare an output schema for each tool", return `structuredContent` and the same value as JSON text in `content` | ? (output limit 25,000 tokens; no statement on `structuredContent`) | ? |
| Server `instructions` | Spec/SDK: `instructions` on the initialize result (v1: `Server` options; v2 page not found) | ? (not mentioned on the pages I read) | yes: first 512 characters should be self-contained | yes: cut at 4,096 characters; used with tool search | ? (not mentioned) |
| Prompts | Spec: `prompts/list`, `prompts/get`; SDK `registerPrompt` | yes: listed as exposable | ? (not mentioned) | yes: become `/mcp__server__prompt` commands | yes: "templated messages and workflows for users" |
| Elicitation (form) | Spec 2025-11-25: server-initiated `elicitation/create`; 2026-07-28: returned as an `InputRequiredResult` the client answers by retrying the call (MRTR) | ? (not listed; docs say Claude implements "a subset"; unsupported list names only subscriptions, sampling, draft features) | ? (not mentioned) | yes: dialog in terminal; declares `elicitation: {form, url}` on modern and on user-configured connections, bare `{}` (form only) on claude.ai connectors | yes: listed |
| Elicitation (URL mode) | Spec 2025-11-25 and later | ? | ? | yes (see above) | ? |
| Resource subscriptions, sampling | Spec (sampling and roots deprecated in 2026-07-28) | no: documented as unsupported | ? | n/a for this server | roots listed |

Limits worth knowing: Claude.ai/Desktop truncates tool results at about 150,000 characters and times a tool call out at 240 s; Claude Code caps results at 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`). Claude Code cuts tool descriptions that load upfront at 4,096 characters (16,384 when loaded via tool search). Keep `find_events` results compact.

## Protocol eras: what a server must handle

- The spec revision **2026-07-28** (stable) makes MCP stateless: no `initialize`, no sessions, no GET stream, every request carries protocol version and client capabilities in `_meta`; servers must implement `server/discover`; server-to-client requests (elicitation, sampling) are replaced by multi round-trip requests (an `InputRequiredResult` the client answers by retrying the call).
- Older clients (2025-11-25 and earlier) still open with `initialize`. A server that wants them must serve both eras ("dual-era"); a modern-only server rejects legacy clients with 400. The spec says a legacy client against a modern-only server fails and "has no fall-forward mechanism".
- The v1 SDK (1.32.x) speaks 2025-era only. The v2 SDK serves both eras from one factory: `createMcpHandler(factory, { legacy: 'stateless' })` is the default.
- Which era each client speaks today: Claude Code documents support for 2026-07-28 and for the earlier revisions. For Claude.ai and ChatGPT the vendor docs say Claude follows the 2025-03-26, 2025-06-18 and 2025-11-25 specs (for authorization) and do not mention 2026-07-28 for either. **A server that only speaks 2026-07-28 would likely not work in Claude.ai or ChatGPT today (unverified); a server that speaks 2025-era works everywhere.** That is the reason to start on v1 or on v2 with legacy serving left on.

## Stateless Streamable HTTP in this repo's SDK line

v1.32.1, as `remote.ts` already does it: one `Server` and one `StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` per POST, closed on `res.on("close")`; GET and DELETE return 405. This is the pattern the SDK's own stateless example uses (I could not open that example file; see "Gaps").

v2 (`@modelcontextprotocol/server` 2.4.0): `createMcpHandler(factory)` returns a web-standard `fetch(Request) => Response`; "the factory runs once per HTTP request: a fresh instance serves every request"; adapters for Express, Hono, Fastify; the handler does **not** validate Host/Origin or tokens (do that in front); `authInfo` is passed in by the caller and reaches tool handlers as `ctx.http.authInfo`. Replies are a single JSON body, switching to SSE only if a tool emits a notification first. The v2 README says v2 uses split packages and Standard Schema (Zod v4 works). I did not find a v2 page for `instructions`, so I cannot confirm how it is set there.

## Serving per-person URLs

What each client accepts, from the vendor docs:

- **Claude.ai / Desktop / mobile**: a custom connector is added by URL on Free, Pro, Max, Ultra, Team and Enterprise (Free gets one). Authentication "No sign-in: anyone with access to the server URL can use the connector". Fixed credentials in request headers (`static_headers`) are **beta, for a limited set of organizations**, and a team Owner adds the connector for the org. Claude's guidance for headers says never accept credentials in the URL, because URLs end in logs and history.
- **ChatGPT**: "No authentication" is an allowed option; OAuth is recommended. Which plans can add a custom connector, and whether friends can, is not stated on the pages I read (**unverified**).
- **Claude Code**: `claude mcp add --transport http name <url> --header "Authorization: Bearer ..."`, plus OAuth and `headersHelper`. It redacts credential-like text and never prints the expanded URL, "which can carry secrets"; error messages show only the origin.
- **Cursor**: URL entry plus OAuth; static credentials via config (environment variables).

Design consequences:

1. **Secret path segment**: `https://<host>/mcp/<token>` is the only mechanism that every client above takes without a login or a beta feature. Treat it as a capability URL: 128 bits of randomness, never in logs or error messages (redact the path), HTTPS only, `Referrer-Policy: no-referrer`. It departs from the MCP authorization spec, which prohibits access tokens in the query string; that rule is about OAuth bearer tokens, so a path secret is a deliberate trade for a private server with a few friends, not the spec's blessed pattern.
2. **Optionally also accept `Authorization: Bearer <token>`** with the same token, for Claude Code and any client that supports headers, so the URL need not carry the secret there.
3. **Identity per request**: look up the token in a link store on each POST; the result (person id, label, revoked flag) becomes the request context. In v1 pass it through a closure when building the per-request `Server`; in v2 through `handler.fetch(req, { authInfo })`. Rate limits (60 calls/hour, 300/day) key on the link id, not on the IP.
4. **Revoke** by deleting or flagging the link in the store; stateless serving means the next request is refused. Answer a bad token with 401 or 404 and no detail.
5. **Origin**: `remote.ts` allows only `https://claude.ai` and its own origin when an `Origin` header is present. ChatGPT's and Cursor's browser origins are not documented on the pages I read, so keep the allow-list configurable and log rejected origins (without the path) on first deploy. The spec requires 403 for an invalid Origin.
6. **Do not mount the OAuth router** for these links. If Claude.ai's "Detected" auth probing expects a 401 with `WWW-Authenticate` on unauthenticated calls, a path-secret server instead answers 404 on unknown tokens; test that Claude.ai accepts a URL whose probe returns tools with no auth.

## Recommendation: `needs_input` result, not elicitation

Use a normal tool result for `plan_outing`:

```json
{ "needs_input": { "questions": [ { "key": "who", "ask": "Who is coming, and how old are they?" } ], "why": "..." } }
```

with `isError: false`, a text block that tells the model to ask the user these questions and call `plan_outing` again with the answers, and the same object as `structuredContent`.

Reasons:

- Elicitation is documented only for Claude Code and Cursor. For Claude.ai and ChatGPT, the two clients most of the friends will use, the vendor docs do not list it (Claude says it implements a subset). A tool that depends on it would hang or fail where it is unsupported.
- Under the 2026-07-28 spec, elicitation becomes a retry round-trip (`InputRequiredResult`), and under 2025-11-25 it needs a server-to-client request that stateless POST-only serving handles awkwardly. Both paths are protocol-era dependent; a `needs_input` result is plain data in every era.
- Form elicitation allows only flat primitive fields. The guide skill's questions are open ("what does a good Saturday look like for a 17-year-old") and the model can phrase them in the conversation, which is how the guide skill already works ("asks first").
- The elicitation spec says servers must handle decline and cancel and must not assume the request succeeds. A `needs_input` result has none of those states to manage.

Later, as an enhancement: when the client declares elicitation (the capability is in `_meta` on 2026-07-28, in `initialize` on 2025-era), the server may elicit and fall back to `needs_input` otherwise. That is optional and should wait until a test in each client shows it working.

## Decisions this supports

1. Transport: stateless Streamable HTTP, POST only, JSON replies, GET and DELETE 405 (what `remote.ts` does today).
2. SDK: pin v1 (`@modelcontextprotocol/sdk` 1.32.x) for v1 of the server, reusing the tool listing and result helpers of `mcp.ts`. Re-evaluate v2 once Claude.ai and ChatGPT are shown to speak 2026-07-28, or sooner if v1.x security fixes stop; v1.x is promised fixes for at least six months after 2026-07-27, that is until about 2027-01-27 at least.
3. Tools: all six get `title`, `annotations` (`readOnlyHint: true` for all, since nothing writes; `openWorldHint: true` since they read third-party sites), and an `outputSchema` with `structuredContent`, always with the same JSON in a text block.
4. `instructions`: set them, but keep the first 512 characters self-contained (ChatGPT) and the whole text under 4,096 characters (Claude Code truncation). Do not rely on Claude.ai or Cursor reading them; the tool descriptions must carry the key rules too.
5. Prompts: optional extra, not required by any flow.
6. `plan_outing`: `needs_input` result.
7. Access: path-secret links in a link store, plus optional bearer header.

## Gaps (not verified)

- Whether Claude.ai and ChatGPT support elicitation, server `instructions`, `structuredContent`, or MCP prompts in practice. Only a live test settles it; a one-tool test server with each feature, added as a connector in each client, would.
- Which protocol revision Claude.ai and ChatGPT negotiate.
- Whether ChatGPT custom connectors in no-auth mode are open to ordinary Plus/Pro accounts, and ChatGPT's browser Origin.
- The v2 SDK's `instructions` option and its v1-to-v2 migration pages (404 at the URLs I tried), and the v1 README's code samples (not shown in the fetched README; `remote.ts` is the working v1 reference).
- Cursor's handling of annotations, `structuredContent` and `instructions` (its page lists tools, prompts, resources, roots, elicitation only).

## Sources

All read on 2026-11-17.

- MCP specification 2026-07-28, Tools: https://modelcontextprotocol.io/specification/latest/server/tools (annotations untrusted, `outputSchema`, `structuredContent`, `isError`, tool list must not vary per connection).
- Elicitation: https://modelcontextprotocol.io/specification/latest/client/elicitation (form and URL modes, flat schemas, three actions, no sensitive data in form mode).
- Streamable HTTP: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http.md (sessions and GET removed; Origin validation; older-client behavior).
- Versioning and compatibility: https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning.md (legacy and modern eras, compatibility matrix, dual-era servers).
- Changelog 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28/changelog.md
- TypeScript SDK repo and README: https://github.com/modelcontextprotocol/typescript-sdk (v2 stable, split packages, v1.x branch fixes for at least six months after 2026-07-27).
- SDK v2 docs: https://ts.sdk.modelcontextprotocol.io/v2/ ; HTTP serving https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html ; legacy clients https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html ; input required https://ts.sdk.modelcontextprotocol.io/v2/servers/input-required.html ; tools https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html ; prompts https://ts.sdk.modelcontextprotocol.io/v2/servers/prompts.html ; protocol versions https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions.html
- npm registry: https://registry.npmjs.org/@modelcontextprotocol/sdk (`latest` 1.32.2) and https://registry.npmjs.org/@modelcontextprotocol/server (`latest` 2.4.0, 2026-10-23).
- Claude, build a server: https://claude.com/docs/connectors/building (transports, supported and unsupported features, size and timeout limits).
- Claude, authentication: https://claude.com/docs/connectors/building/authentication.md (auth types, `none`, `static_headers` beta, no credentials in URLs).
- Claude, review criteria (annotations): https://claude.com/docs/connectors/building/review-criteria.md
- Claude, add a custom connector: https://claude.com/docs/connectors/custom/add-unlisted.md (plans, No sign-in, request headers).
- ChatGPT / OpenAI MCP: https://developers.openai.com/api/docs/mcp/ (output schema, `structuredContent`, OAuth) and https://developers.openai.com/api/docs/guides/developer-mode (instructions, no-auth, `readOnlyHint`, write confirmation).
- Community report on annotations in ChatGPT Business (unverified, secondary): https://community.openai.com/t/mcp-annotations-being-ignored/1369672
- Claude Code MCP: https://code.claude.com/docs/en/mcp (HTTP transport, headers, elicitation modes, prompts as commands, instructions limit, `readOnlyHint`).
- Cursor MCP: https://cursor.com/docs/context/mcp (transports; tools, prompts, resources, roots, elicitation).
- This repo: https://github.com/hoaj/cph-activities/blob/main/skills/kultunaut/cli/src/runtime/remote.ts , https://github.com/hoaj/cph-activities/blob/main/skills/kultunaut/cli/src/runtime/mcp.ts , https://github.com/hoaj/cph-activities/blob/main/skills/kultunaut/cli/package.json
