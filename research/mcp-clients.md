# Which MCP clients accept a no-login remote server with a secret in its URL?

Researched 2026-11-17 for hoaj/cph-activities#20 (map #19). Primary sources only; where a point is not stated in a client's own docs it says so.

## Findings per client

| Client | No-login remote server (no OAuth) | Secret in URL (`/mcp/<secret>` or `?key=`) | Authorization header | Notes and limits |
|---|---|---|---|---|
| Claude.ai web, Claude desktop, Claude mobile (custom connectors) | Yes. Authentication setting "No sign-in": "anyone with access to the server URL can use the connector". | Works by the docs' own wording: the URL is entered "exactly as the provider documents it, including any path". Docs do not mention secrets in URLs or query strings, and do not say the URL is stored unchanged, so verify with a real connector. | Yes, but "Request headers" is beta, limited to some organizations; up to 4 headers; custom header names need Anthropic approval, `authorization`, `x-api-key`, `x-auth-token` are pre-approved. | Claude connects from Anthropic's cloud, not the device, so it works the same in mobile apps; server must be public HTTPS on the standard port (no custom port). Free plan: one custom connector. Team/Enterprise: an Owner adds it. Auth settings cannot be edited later (remove and re-add). URL ending `/sse` selects legacy SSE transport. Connector URL is editable. |
| ChatGPT (custom MCP apps / connectors) | Yes. Auth options: OAuth, No authentication, OAuth or no authentication. | Not documented either way. Server URL is a free field, so a path secret should work; unverified. | Not mentioned in OpenAI's docs. | Streamable HTTP and SSE supported. Access is gated by plan and workspace: the help centre limits full custom MCP to Business and Enterprise/Edu on web (Pro read/fetch only); Plus is not confirmed. Developer-mode flow is being replaced by adding a custom MCP server directly in Plugins; check the live UI. Connectors were renamed "apps". Not usable on a ChatGPT Free plan as far as the docs show. |
| Claude Code | Yes. `claude mcp add --transport http <name> <url>`; a server that needs no credentials connects with no auth header. OAuth is only started after a 401/403. | Yes. The URL is used as given; `${VAR}` expansion works in `url`, so the secret can live in an env var (`"url": "https://host/mcp/${CPH_KEY}"`). Spellings differing by scheme/host case, default port or trailing slash count as the same endpoint. Credential-named variables (e.g. `ANTHROPIC_API_KEY`) expand empty in remote `url`/`headers`; use a custom name. | Yes: `--header "Authorization: Bearer ..."`, also in `.mcp.json`, with `${VAR}` expansion. | If a configured Authorization header is rejected, Claude Code reports failure and does not fall back to OAuth. JSON entry with `url` but no `type` is skipped as stdio; use `"type": "http"`. |
| Cursor | Yes. A remote entry with only `url` works; OAuth is configured separately via an `auth` object. | Yes. `url` is used as given; `${env:NAME}` interpolation works in `url` and `headers`. | Yes: `headers` object, e.g. `"Authorization": "Bearer ${env:MY_SERVICE_TOKEN}"`. | Remote servers do not support `envFile`; use shell/system env vars. Cursor docs do not state a URL rewrite. |
| Generic MCP client | Yes by spec: "Authorization is OPTIONAL" for MCP implementations. | Spec says nothing about secrets in URLs; it only forbids access tokens in the query string for the OAuth flow ("Access tokens MUST NOT be included in the URI query string"). A path secret is therefore outside the spec's auth model, and behaviour is per client. | Spec's auth uses `Authorization: Bearer <token>` on every HTTP request; clients that support custom headers can send it. | A client that gets a 401 will start OAuth discovery (RFC 9728); a no-login server must not return 401 for the secret path, or should return 404 for a wrong secret. |

## Answer

All six can reach a remote Streamable HTTP MCP server with no OAuth. Claude Code and Cursor take the URL verbatim and expand env vars inside it, so `/mcp/<secret>` survives; both also take an `Authorization` header. Claude.ai, Claude desktop and Claude mobile accept "No sign-in" custom connectors with any path, so a path secret is expected to survive; the docs never address secrets in URLs, so test it once, and prefer a path segment over a query parameter. Their Request headers option is limited-access beta. ChatGPT supports "No authentication" but has the most plan-gated and shifting UI (Business/Enterprise/Edu confirmed for full custom MCP; Plus unconfirmed). No client doc says it strips or rewrites the URL; none was found that requires OAuth or a domain allowlist for custom servers. Claude's cloud connects only to public HTTPS on the standard port, and Anthropic offers IP allowlisting for firewalled servers (not relevant on Railway).

Server design implications: use a path secret (`/mcp/<secret>`), return 404 (not 401) for unknown secrets so clients do not begin OAuth discovery, never log full URLs, and serve over HTTPS on port 443.

## Gaps to verify empirically

- Claude.ai/mobile: that a long path secret is stored and sent unchanged on every request (docs silent).
- ChatGPT: which of the maintainer's friends' plans can add a custom MCP server at all.
- Query-parameter secrets in any client (docs silent; path is safer).

## Sources

- Claude: [Add a connector that isn't in the directory](https://claude.com/docs/connectors/custom/remote-mcp.md) (Authentication: "No sign-in", Request headers, transport, edit/remove)
- Claude: [Using remote MCP servers](https://support.claude.com/en/articles/11175166-using-remote-mcp-servers) (URL "exactly as the provider documents it, including any path"; standard port; cloud connection incl. mobile; IP allowlisting)
- OpenAI: [Developer mode](https://developers.openai.com/api/docs/guides/developer-mode.md) (OAuth / No authentication / mixed; SSE and streaming HTTP)
- OpenAI: [Connecting custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta) (plan availability; read via search snippet, direct fetch returned 403)
- Claude Code: [MCP](https://code.claude.com/docs/en/mcp) (`--transport http`, `--header`, env expansion in `url`, 401/403 OAuth trigger)
- Cursor: [MCP](https://cursor.com/docs/context/mcp) (`url`, `headers`, `${env:...}` interpolation, `auth` object)
- MCP spec 2025-11-25: [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) (optional; 401 triggers discovery; no tokens in query string)
