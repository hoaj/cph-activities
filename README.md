# cph-activities

Find events and things to do in Copenhagen, with links to book them yourself.

A plugin for coding agents (Claude Code, Cursor, Codex, GitHub Copilot CLI). Each CLI skill in `skills/` wraps one site with a small compiled CLI that your agent runs for you. It notices when the site changes (Drift) and, once you agree, reports it here so it gets fixed.

**Maintainer:** [@hoaj](https://github.com/hoaj). Generated with [site-cli-creator](https://github.com/hoaj/site-cli-creator).

## Requirements

- `curl`, which macOS, Linux and Git Bash on Windows already have. The CLI binaries download over HTTPS from this repo's public releases, with no GitHub account.
- [GitHub CLI](https://cli.github.com), logged in (`gh auth login`), only to report a problem with the Feedback skill, or to install from [`hoaj/cph-activities`](https://github.com/hoaj/cph-activities) if it is private (then you also need read access).
- [Google Chrome](https://www.google.com/chrome/), for CLI skills that sign in to a site or have write commands, and for `billetto`, which opens it unseen to read billetto.dk's search settings. The skill tells you when it needs it.
- macOS (Apple silicon or Intel), Linux (x64 or arm64) or Windows x64. On Windows the install step runs in Git Bash.

## Install

This repo is its own plugin marketplace, named `cph-activities`: add the marketplace, then install the plugin from it.

### Claude Code

```
/plugin marketplace add hoaj/cph-activities
/plugin install cph-activities@cph-activities
```

### Cursor

Settings → Plugins → Add marketplace → `hoaj/cph-activities`, then install **cph-activities**.

### Codex

```
codex plugin marketplace add hoaj/cph-activities
codex plugin install cph-activities
```

### GitHub Copilot CLI

```
copilot plugin marketplace add hoaj/cph-activities
copilot plugin install cph-activities@cph-activities
```

There is no setup step. The first time your agent uses a CLI skill, it runs that skill's `install.sh`, which downloads the binary matching the skill's version into the skill's `bin/` folder. Skills that need a login open Chrome once for you to sign in.

### The hosted server (claude.ai, ChatGPT, the phone)

The website https://cph-activities-production.up.railway.app has a chat on all the sources and gives you a personal MCP address (no login): add it as a custom connector in claude.ai or ChatGPT, or with `claude mcp add --transport http cph-activities <address>`. It may make 60 tool calls an hour and 300 a day.

### Any MCP client (Claude Desktop, Cursor, …)

Every CLI skill's binary is also an MCP server: `skills/<skill>/bin/<skill> mcp` serves the same Tasks as tools over stdio, with the same login, Drift checks and dry runs for writes. Clone this repo, get the binary once with `bash skills/<skill>/install.sh`, then add it to your client:

```json
{ "mcpServers": { "<skill>": { "command": "/path/to/cph-activities/skills/<skill>/bin/<skill>", "args": ["mcp"] } } }
```

Claude Code: `claude mcp add <skill> -- /path/to/cph-activities/skills/<skill>/bin/<skill> mcp` (the plugin above is the better fit there: it also brings the skills' guidance). Your session stays on your machine, in the same state dir the CLI uses.

### Remote mode (claude.ai and the phone)

To use a CLI skill from claude.ai or your phone, it has to run on a server you control. Ask your agent to deploy it: the `cph-activities-deploy` skill walks through Railway, one server per CLI skill. You choose an Owner password that signs your clients in (the skill can generate one), give the server your Session on its Setup page (`/setup`), and add the server's `/mcp` address as a custom connector. It is for your own account only. A connector added in claude.ai also shows up in Claude Code; if you run the CLI skill's local `mcp` there too, turn the claude.ai one off with `/mcp`, or all claude.ai connectors with `"disableClaudeAiConnectors": true` in `~/.claude/settings.json`.

## Update

Update the plugin in your agent's plugin manager (Claude Code: `/plugin update cph-activities`). A new version lands in a new folder, so the agent downloads the matching binary on first use. Right after a release, the binary can take a few minutes to build; `install.sh` says so when it is not there yet.

## Report a problem

Ask your agent to "report this". The `cph-activities-feedback` skill drafts a GitHub issue on `hoaj/cph-activities` from the CLI's error output (shapes and type names, never your data), shows it to you, and files it only when you say yes. It also files requests for things the plugin cannot do yet.

To check whether the site changed or the problem is on your side, ask your agent to run the skill's `check` command.

## Maintaining

Changes are made with the site-cli-creator generator (`add-skill`, `add-task`, `fix`). Every change bumps the version (`bun run bump <patch|minor|major>`); merging it to `main` builds and publishes the release.

### Daily drift check

`.github/workflows/drift-check.yml` runs every CLI skill's read-only `check` against its site each morning (and on demand: `gh workflow run drift-check.yml`), with the released binary. Drift opens an issue titled with its Fingerprint and labelled `drift`, the same issue a user's report would file, for `fix`; a failing check opens a `bug`, and an expired CI session a `ci-session` issue.

Every CLI skill is in it unless its `site.ts` says `dailyCheck: false` (the answer you gave when it was added; change it there and bump to change it). A skill with a login is checked only with a CI session stored as the secret `SESSION_<PLUGIN>_<SKILL>` (upper case, `-` as `_`); until then it is skipped with a notice. Make it with a sign-in of its own, never a copy of your own `session.json` (the two would share a refresh token, and whichever renews first spends the other's):

```sh
(cd skills/<skill> && export SITE_CLI_HOME="$(mktemp -d)" && bin/<skill> login && gh secret set SESSION_<PLUGIN>_<SKILL> --repo hoaj/cph-activities < "$SITE_CLI_HOME/session.json"; rm -rf "$SITE_CLI_HOME")
```

A site whose sign-in lasts only hours, or that rotates its refresh token on every renewal, needs this again when the check opens a `ci-session` issue.

A CI login with several accounts is checked for the one in the secret `ACCOUNT_<PLUGIN>_<SKILL>` (an id as `--account` takes it); without it, `check` stops at the account choice and the run opens a `check: … (input)` issue.

A run that could not check a skill at all (no released binary to install, a crash) is red, so GitHub tells you. GitHub turns a scheduled workflow off after 60 days with no activity in the repo; turn it back on with `gh workflow enable drift-check.yml --repo hoaj/cph-activities`.
