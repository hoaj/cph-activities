# Can Claude Code run unattended on a Claude subscription, and on which hosts?

Research for [#73](https://github.com/hoaj/cph-activities/issues/73), part of the map [#72](https://github.com/hoaj/cph-activities/issues/72). Sources were read on 2026-11-28. Only Anthropic's docs, help center and terms, the `anthropics/claude-code-action` repo (at commit `4411a9e`, 2026-11-25) and Railway's docs count as sources here. This repo's own files and issues are cited as evidence of what fix mode needs.

## Answer in short

- **It works technically.** `claude setup-token` gives a one-year OAuth token tied to the subscription. Set it as `CLAUDE_CODE_OAUTH_TOKEN` and `claude -p` or `anthropics/claude-code-action` runs on the Pro/Max plan with nobody present. Nothing refreshes the token: once a year someone runs `claude setup-token` again in a browser and replaces the secret.
- **The terms are permissive in practice but not explicit.** The Consumer Terms forbid "automated or non-human means" unless "via an Anthropic API Key or where we otherwise explicitly permit it". Anthropic's docs document the subscription token "for CI pipelines and scripts", and document the GitHub Action running on a prompt with no mention and scheduled cloud tasks on Pro/Max. The help center says `claude -p` on a plan "still draw[s] from your subscription limits". No sentence in the terms names any of these as the permitted exception, so reading them as that permission is an inference. The same docs also say the plan's advertised limits "assume ordinary, individual usage". Safest course: run the unmodified `claude` CLI or the official action, for the maintainer's own repo only. Do not build a custom Agent SDK app on the subscription login.
- **Usage** counts against the same five-hour and weekly limits as interactive use.
- **Plugins load headless.** The action has `plugin_marketplaces` and `plugins` inputs (`https://github.com/hoaj/plugins.git` and `site-cli-creator@hoaj`). The CLI has `claude plugin install … --marketplace` or `--plugin-dir`. `--bare` must not be used: it skips plugins and ignores `CLAUDE_CODE_OAUTH_TOKEN`.
- **Hosts.** A GitHub-hosted runner has everything fix mode needs except an address absalon accepts (#60). It also carries GitHub's rule that `GITHUB_TOKEN` events start no workflows. An always-on machine of the maintainer's has the address the sites already accept. Railway can carry the whole toolchain in a Dockerfile, but its docs say nothing about whether the sites accept its addresses. A fourth candidate the ticket didn't list is Anthropic's cloud scheduled tasks. They are on the subscription and triggered by GitHub issue events, but they block `gh issue`/`gh pr`, which fix mode uses.

## 1. Auth

### The subscription token

- `claude setup-token` makes "a one-year OAuth token". It "opens the same browser authorization flow as `/login`, and the token prints to the terminal after you approve access in the browser. It does not save the token anywhere; copy it and set it as the `CLAUDE_CODE_OAUTH_TOKEN` environment variable". ([Authentication: Generate a long-lived token](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token))
- "This token authenticates with your Claude subscription and requires a Pro, Max, Ultra, Team, or Enterprise plan. It can only make model requests, so it can't establish Remote Control sessions or fetch claude.ai connectors. MCP servers you configure locally still work." (same page)
- Precedence: `CLAUDE_CODE_OAUTH_TOKEN` is fifth, after cloud-provider variables, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY` and `apiKeyHelper`: "Use this for CI pipelines and scripts where browser login isn't available." In `-p` mode, an `ANTHROPIC_API_KEY` that is present "is always used", so the fixer's environment must not carry one or the run bills the API instead. ([Authentication precedence](https://code.claude.com/docs/en/authentication#authentication-precedence))
- **Bare mode doesn't read it.** "Bare mode does not read `CLAUDE_CODE_OAUTH_TOKEN`. If your script passes `--bare`, authenticate with `ANTHROPIC_API_KEY` or an `apiKeyHelper` instead." ([Authentication](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token); also [Headless: bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)) The headless docs recommend `--bare` for CI and say it "will become the default for `-p` in a future release". When that happens, a subscription run will need an explicit way out of bare mode. Watch the changelog.
- The `setup-token` flow enforces only `forceLoginMethod`, not `forceLoginOrgUUID`. That matters only under managed settings, which a personal machine doesn't have. ([Restrict login to your organization](https://code.claude.com/docs/en/authentication#restrict-login-to-your-organization))

### Lifetime and renewal

- The lifetime is one year (quoted above). It doesn't refresh itself. "To replace an expired token, generate a new one and restart." ([env-vars: `CLAUDE_CODE_OAUTH_TOKEN`](https://code.claude.com/docs/en/env-vars))
- On expiry or revocation the run fails with `OAuth token revoked` / `OAuth token has expired`. "Claude Code keeps sending the value you set after a request fails with a 401, rather than switching to a stored login's token … Generate a fresh token with `claude setup-token` and restart with it." ([Errors: OAuth token revoked or expired](https://code.claude.com/docs/en/errors#oauth-token-revoked-or-expired)) A fixer should therefore treat an auth failure as "renew the token" and tell the maintainer. Retrying won't help.
- `claude auth status` reports `authMethod` (`oauth_token` for this variable). Its `loginExpiresAt` field and the `Sign-in ends` line are documented for "a stored login", and "the line is absent for other credentials". ([CLI reference](https://code.claude.com/docs/en/cli-reference), [Check when a stored login ends](https://code.claude.com/docs/en/authentication#check-when-a-stored-login-ends)) **The docs are silent** on whether a setup-token's expiry date can be read anywhere. They also don't say how to revoke one token on its own. Record the creation date when the secret is set, and set a reminder before the year ends.

### The alternative on a machine you own: a stored `/login`

- `claude auth login` stores the login in `~/.claude/.credentials.json` (mode `0600`) on Linux and in the Keychain on macOS. On macOS it falls back to that file "when it's locked in an SSH session". ([Credential management](https://code.claude.com/docs/en/authentication#credential-management))
- A stored login also ends. "Using Claude Code doesn't extend the login." `claude -p` prints `Warning: this sign-in` on stderr when the end is under 10 days away, and "Renewing early matters most for sessions that run unattended." ([Check when a stored login ends](https://code.claude.com/docs/en/authentication#check-when-a-stored-login-ends), [Renew an expiring login](https://code.claude.com/docs/en/authentication#renew-an-expiring-login)) The docs don't state the length of a stored login. The setup-token is the only credential with a documented lifetime.

### In `anthropics/claude-code-action`

- Input `claude_code_oauth_token`: "OAuth token for authenticating with a Claude subscription, generated with `claude setup-token`". ([GitHub Actions docs: Action parameters](https://code.claude.com/docs/en/github-actions#action-parameters); [action.yml](https://github.com/anthropics/claude-code-action/blob/main/action.yml)) The action's setup guide: "`CLAUDE_CODE_OAUTH_TOKEN` for OAuth token authentication (Pro and Max users can generate this by running `claude setup-token` locally)". ([docs/setup.md](https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md))
- "If you authenticate with an OAuth token, runs use your Claude subscription instead of API billing." ([GitHub Actions docs: Manage costs](https://code.claude.com/docs/en/github-actions#manage-costs))
- For secrets shared across repos, Anthropic advises an API key "since an OAuth token is tied to the subscription of the person who ran `claude setup-token`". That doesn't apply here: this is one repo. ([Set up for an organization](https://code.claude.com/docs/en/github-actions#set-up-for-an-organization))

## 2. Terms and usage limits

### Which terms apply

- Claude Code is "subject to … Consumer Terms of Service - for Free, Pro, Max, and Ultra users". ([Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#license))
- The Consumer Terms page served from Denmark is the EEA/Switzerland version with Anthropic Ireland, "Effective Oct 8, 2025". Its §3 list of forbidden uses includes: "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, to access the Services through automated or non-human means, whether through a bot, script, or otherwise." ([Consumer Terms](https://www.anthropic.com/legal/consumer-terms)) "Services" covers "Claude.ai, Claude Pro, and other products and services that we may offer for individuals, along with any associated apps, software, and websites". The terms never name Claude Code.
- §2: "You may not share your Account login information, Anthropic API key, or Account credentials with anyone else or make your Account available to anyone else." (same page) A token in the maintainer's own repo secret, used for his own repo, doesn't share it. A fixer that others could steer (for example, by filing an issue it acts on) moves closer to "make your Account available". The trigger design (#76) should keep the fixer to issues the daily check opened, as the map already decides.

### What Anthropic's docs say about automated use of a plan

These are the passages that could count as "where we otherwise explicitly permit it". None of them says it is that exception.

- The setup-token is documented "for CI pipelines, scripts, or other environments where interactive browser login isn't available". ([Authentication](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token))
- The GitHub Action's automation mode: "when the workflow provides a `prompt` input, Claude runs without waiting for a mention". Every example says to swap in `claude_code_oauth_token` "if you authenticate with a Claude subscription". ([GitHub Actions: Interactive and automation modes](https://code.claude.com/docs/en/github-actions#interactive-and-automation-modes), [Example use cases](https://code.claude.com/docs/en/github-actions#example-use-cases))
- Cloud scheduled tasks: "Put Claude Code on autopilot", "Scheduled tasks are available on Pro, Max, Ultra, Team, and Enterprise plans", and they "run autonomously as full Claude Code cloud sessions". ([Scheduled tasks](https://code.claude.com/docs/en/routines))
- Help center, "Use the Claude Agent SDK with your Claude plan" (updated 2026-10-07): "when you're signed in with your Claude plan, the Claude Agent SDK and `claude -p` still draw from your subscription limits". The June 15, 2026 note says the planned split of SDK usage from plan limits was paused. ([support article 15036540](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan))

### Limits on that use

- "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage of Claude Code and the Agent SDK." ([Legal and compliance: Acceptable use](https://code.claude.com/docs/en/legal-and-compliance#acceptable-use))
- "OAuth authentication … is designed to support ordinary use of Claude Code and other native Anthropic applications." Developers building products, "including those using the Agent SDK, should use API key authentication". "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users." The same section adds: "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription." ([Legal and compliance: Authentication and credential use](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use))
- Agent SDK: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." Also: "Use of the Claude Agent SDK is governed by Anthropic's Commercial Terms of Service". ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview))

**Where the sources are silent or ambiguous:**
- No source says whether a personal, issue-triggered fixer running a few times a week counts as "ordinary, individual usage". No source defines that phrase. The legal page points questions about permitted auth methods to [contact sales](https://www.anthropic.com/contact-sales).
- The Agent SDK is under the Commercial Terms, while a Pro/Max login is under the Consumer Terms. The help center still says the SDK on a plan draws from plan limits. The docs never reconcile these. Using the `claude` CLI (`claude -p`), or the official action, keeps the fixer inside "the unmodified Claude Code binary" that the legal page explicitly leaves open. A custom Agent SDK program on the subscription login would not be.

### Usage limits a fix run counts against

- "Pro and Max plans have a five-hour session limit and a weekly limit." Max also has a separate weekly limit for Fable. "These limits are shared across Claude and Claude Code, meaning all activity in both tools counts against the same limits." ([Use Claude Code with your Pro or Max plan](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)) A fix run and the maintainer's own sessions draw from one pool. A run that hits the limit stops, or continues on usage credits if they are on.
- `claude -p` and the SDK draw from the same plan limits (help center article above). Cloud scheduled tasks "draw down subscription usage the same way interactive sessions do", with extra hourly run caps. ([Scheduled tasks: Usage and limits](https://code.claude.com/docs/en/routines#usage-and-limits))
- Auto mode's safety classifier can add usage: "Where the server's check doesn't reach a session, Claude Code makes its own classifier requests, which count toward token usage". ([action docs/usage.md: Provider notes](https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md#permission-mode))
- Caps per run: `--max-turns` ("No limit by default") and `--max-budget-usd`, both print mode only. ([CLI reference](https://code.claude.com/docs/en/cli-reference)) The budget cap is a client-side API-price estimate, so on a subscription it bounds work, not money. The docs don't say how that estimate relates to plan usage.
- How much usage one fix run takes is not in any source. #74 measures it.

## 3. Plugins and skills in a headless run

- `claude -p` without `--bare` "discovers and loads them as an interactive session would, including anything configured in the working directory or `~/.claude`". `--bare` skips "hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and CLAUDE.md". ([Headless: bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode))
- In `-p`, `/plugin` doesn't run. "Plugins you already installed do load. Install and manage them from your shell with `claude plugin` commands." ([Install plugins: non-interactive runs](https://code.claude.com/docs/en/plugins/install#jetbrains-non-interactive-runs-and-the-agent-sdk)) From a setup script: `claude plugin install <plugin> --marketplace <source>` adds the marketplace and installs in one step (v2.1.292+). Pass `--yes` for a marketplace whose plugin source is a `command`. ([Install from your shell](https://code.claude.com/docs/en/plugins/install#install-from-your-shell), [Add and install from your shell](https://code.claude.com/docs/en/plugins/install#add-and-install-from-your-shell))
- For site-cli-creator, the marketplace is `hoaj/plugins` with manifest name `hoaj`, and the plugin is `site-cli-creator@hoaj` ([hoaj/plugins marketplace.json](https://github.com/hoaj/plugins/blob/main/.claude-plugin/marketplace.json), [site-cli-creator README](https://github.com/hoaj/site-cli-creator#readme)). On a host:
  ```bash
  claude plugin install site-cli-creator --marketplace hoaj/plugins
  ```
  Or load a checkout for one session: `claude -p --plugin-dir <path-to-site-cli-creator> …`. `--plugin-url` loads a `.zip`. ([CLI reference](https://code.claude.com/docs/en/cli-reference))
- Third-party marketplaces have auto-update "Off by default". On a long-lived host, run `claude plugin update site-cli-creator@hoaj` before each run so fix mode is current. ([Keep plugins updated](https://code.claude.com/docs/en/plugins/install#keep-plugins-updated))
- A skill is invoked from the prompt: "User-invoked skills and custom commands work. Include `/skill-name` in the prompt string". ([Headless: Create a commit, note](https://code.claude.com/docs/en/headless#create-a-commit)) For a plugin skill that is `/site-cli-creator:site-cli-creator fix …`.
- To fail loudly when the plugin didn't load: the `system/init` event in `--output-format stream-json` lists `plugins` and `plugin_errors`. ([Headless: Fail CI when a plugin … doesn't load](https://code.claude.com/docs/en/headless#fail-ci-when-a-plugin-or-mcp-server-doesnt-load))
- **In the GitHub Action:** "For a skill packaged in a plugin, install the plugin with the `plugin_marketplaces` and `plugins` inputs, then pass the namespaced `/plugin-name:skill-name` as the `prompt`. The `plugins` input takes `plugin-name@marketplace-name`, where the marketplace name comes from the marketplace's own manifest". ([GitHub Actions: Run a skill](https://code.claude.com/docs/en/github-actions#run-a-skill)) Here that is `plugin_marketplaces: "https://github.com/hoaj/plugins.git"` and `plugins: "site-cli-creator@hoaj"`.
- **Agent SDK:** plugins load only by local path (`type: "local"`). "To use a plugin distributed through a marketplace … download it first and provide the local directory path." ([Agent SDK: Plugins](https://code.claude.com/docs/en/agent-sdk/plugins))
- **Permissions in an unattended run:** since v2.1.302, `claude -p` starts in Manual mode, where an unapproved call is denied. Use `--permission-mode auto` (a classifier decides) or `--allowedTools` rules, plus `--permission-prompts none` "when nobody is available to answer permission prompts". ([Headless: Auto-approve tools](https://code.claude.com/docs/en/headless#auto-approve-tools), [Turn off permission prompts in unattended runs](https://code.claude.com/docs/en/headless#turn-off-permission-prompts-in-unattended-runs)) The action runs in auto mode by default unless `allowed_bots` or `allowed_non_write_users` is set. ([action docs/usage.md: Permission Mode](https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md#permission-mode))
- A `-p` run "runs the hooks in a project's `.claude/settings.json` and connects the servers in its `.mcp.json`, even in a folder you've never trusted". This is fine for this repo's own checkout, but the fixer should never run `-p` inside a checkout it didn't make. ([Headless: bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode))

## 4. The hosts

Fix mode needs these, from [fix.md](https://github.com/hoaj/site-cli-creator/blob/main/skills/site-cli-creator/reference/fix.md) and this repo's [drift-check.yml](https://github.com/hoaj/cph-activities/blob/main/.github/workflows/drift-check.yml):
- git
- `gh` with a token that can comment, push and open, check and merge PRs. Fix mode uses `gh issue list/view`, `gh pr create`, `gh pr checks --watch` and `gh pr merge`.
- Bun
- Google Chrome, headless or under `xvfb-run` for `browserWindow: true` skills
- egress from an address the sites accept

| Needs | GitHub-hosted runner + claude-code-action | Always-on machine (Mac or VM) | Railway service | Anthropic cloud scheduled task (not in the ticket) |
| :- | :- | :- | :- | :- |
| Subscription auth | `claude_code_oauth_token` input (documented) | `CLAUDE_CODE_OAUTH_TOKEN` or a stored `/login` | `CLAUDE_CODE_OAUTH_TOKEN` as a service variable | Built in: the task "belong[s] to your individual claude.ai account" |
| Plugins | `plugin_marketplaces` + `plugins` inputs | `claude plugin install` once, update per run | `claude plugin install` in the image or at start | Only via claude.ai/customize/plugins. Repo `extraKnownMarketplaces` is **not** read |
| git, `gh` | Preinstalled. Token: see below | Whatever is installed | Install in a Dockerfile | `gh` preinstalled, but `gh issue`/`gh pr` are **blocked** (GraphQL) |
| Bun | `oven-sh/setup-bun` (drift-check uses it) | Install | Install in a Dockerfile | "installed but has known proxy compatibility issues" |
| Chrome / display | `/usr/bin/google-chrome` + `xvfb-run` (drift-check uses both) | Native Chrome. A Mac has a display | Install Chrome + xvfb in a Dockerfile | Chrome for Testing at `/usr/bin/google-chrome`. No word on a display |
| Egress the sites accept | **No** for absalon: "The site refuses requests from the CI runner" ([#60](https://github.com/hoaj/cph-activities/issues/60)) | The maintainer's own address, which local runs already use | Unknown. Static IPs are Pro-only and shared | Unknown. Traffic goes through Anthropic's security proxy |
| Trigger on a daily-check issue | Not from an `issues: opened` workflow (see below) | Needs its own trigger (poll, webhook) | Cron (≥5 min) or a webhook endpoint | GitHub "Issue … opened" event trigger |

### GitHub Actions job

- The action runs "entirely on your own GitHub runner" ([README](https://github.com/anthropics/claude-code-action#features)). Self-hosted runners work too: its security doc covers "a self-hosted runner that keeps its home directory" ([docs/security.md](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)). A self-hosted runner on the always-on machine would fix the egress problem but keep the Actions wiring. Weigh GitHub's own guidance on self-hosted runners in public repos in #75. That guidance is outside this note's sources.
- **Events made with `GITHUB_TOKEN` start no workflows.** The action's FAQ: "The `github-actions` user cannot trigger subsequent GitHub Actions workflows." ([docs/faq.md](https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md)) The Claude Code docs: "GitHub doesn't trigger workflows on commits made with the default `GITHUB_TOKEN`. If you pass `github_token: ${{ secrets.GITHUB_TOKEN }}` … remove it so it authenticates as the Claude GitHub App, or pass a custom app token instead". ([GitHub Actions: CI not running on Claude's commits](https://code.claude.com/docs/en/github-actions#ci-not-running-on-claudes-commits)) This hits the fixer three times:
  1. The drift check files its issues with `GH_TOKEN: ${{ github.token }}`, so an `issues: opened` workflow will not start on them. #76 must pick another trigger, such as a job in the drift-check workflow itself, `workflow_run`, or a schedule.
  2. A fix PR pushed with `GITHUB_TOKEN` gets no CI, so fix mode's `gh pr checks --watch` never goes green.
  3. A merge with `GITHUB_TOKEN` won't start `release.yml`.

  The fixer needs the Claude GitHub App's token or a custom GitHub App's token.
- The action rejects bot actors unless listed in `allowed_bots`. A `schedule` run is attributed to "the one who last changed the workflow's `cron` schedule". ([GitHub Actions: Who can trigger runs](https://code.claude.com/docs/en/github-actions#who-can-trigger-runs))
- **Permissions and the standing rule.** The official Claude GitHub App grants a wide set, including Actions, Workflows, Repository hooks and Repository creation, all read and write. "GitHub doesn't let you accept a subset." For a narrower set, "create a custom GitHub App with Contents, Issues, and Pull requests". ([GitHub Actions: GitHub App permissions](https://code.claude.com/docs/en/github-actions#github-app-permissions)) The map's rule that the agent never gets more than fix mode needs points to a custom app. Fix mode also needs to read check status (`gh pr checks`), which the docs give through `actions: read` ([Respond to @claude mentions](https://code.claude.com/docs/en/github-actions#respond-to-claude-mentions)). **Sources disagree:** the Claude Code docs list Workflows as read and write for the official app, while the action's FAQ says "The GitHub App for Claude doesn't have workflow write access".
- Cost on top of the plan: Actions minutes ([Manage costs](https://code.claude.com/docs/en/github-actions#manage-costs)). This repo is public.

### Always-on machine

- Runs `claude -p` with the setup-token, or with a stored login that needs renewing before it ends (§1). On macOS over SSH, the Keychain may be locked, and the login then lives in `~/.claude/.credentials.json` ([Credential management](https://code.claude.com/docs/en/authentication#credential-management)).
- The Claude Desktop app's local scheduled tasks are on the subscription but "only fire while the app is open and your computer is awake". They have schedules only, no GitHub-event trigger, and a run can stall on a permission prompt until someone answers it. ([Desktop scheduled tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks))
- Egress is the maintainer's own address. That is the one the Captures and local `check` runs already use, so absalon's block (#60) doesn't apply. Chrome can run headed. This host needs its own trigger and its own upkeep: power, updates, `claude` and plugin updates.

### Railway service

- Builds from a `Dockerfile` at the source root, or one named by `RAILWAY_DOCKERFILE_PATH`. So the image can carry `claude`, Bun, git, `gh`, Chrome and xvfb. ([Railway: Dockerfiles](https://docs.railway.com/builds/dockerfiles)) Railway's docs say nothing about Claude Code or Chrome specifically.
- Cron: "Scheduled runs must be at least 5 minutes apart in UTC". "Scheduled services should exit as soon as they are done". "If a previous execution is still running when the next scheduled execution is due, Railway will skip the new cron job." That skip gives one fix at a time for free. ([Railway: Cron jobs](https://docs.railway.com/reference/cron-jobs))
- Persistence for `~/.claude` (the installed plugin, the Chrome profile for a login skill): volumes, one per service, 5 GB default on Hobby. ([Railway: Volumes](https://docs.railway.com/reference/volumes))
- Egress: "Static Outbound IPs let customers on the Pro plan assign permanent outbound IPv4 addresses". "There is no guarantee that the IPv4 addresses assigned to your service are dedicated." ([Railway: Static outbound IPs](https://docs.railway.com/reference/static-outbound-ips)) **Railway's docs don't say** whether its addresses are datacenter ranges, which is what bot walls usually block. Only a test can tell whether absalon and the other sites accept them.
- Price: Hobby $5/month with $5 of usage included. Pro $20/month. $20 per vCPU-month and $10 per GB-month of RAM. ([Railway: Plans](https://docs.railway.com/reference/pricing/plans))

### Anthropic cloud scheduled task (a fourth candidate for #75)

- It is on the subscription and unattended by design. A GitHub trigger fires on "An issue is opened, edited, closed, reopened, labeled, assigned, or otherwise updated". It needs the Claude GitHub App on the repo. "GitHub webhook events are subject to per-task and per-account hourly caps." It is a research preview. ([Scheduled tasks](https://code.claude.com/docs/en/routines))
- The VM is Ubuntu 24.04 with 4 vCPU, 16 GB RAM and 30 GB disk. It has Chrome for Testing at `/usr/bin/google-chrome`, Bun, and `gh`. Setup scripts run as root (`apt install` works). ([Cloud environments](https://code.claude.com/docs/en/cloud-environments))
- What breaks fix mode:
  - "`gh` subcommands that use GraphQL, such as `gh pr` and `gh issue`, get the same 403", even with your own `GH_TOKEN`. Fix mode would have to switch to `gh api` REST calls.
  - Repo-declared marketplaces aren't added. The plugin must be added on claude.ai instead.
  - Outbound traffic goes through Anthropic's "security proxy" from undocumented addresses.

  (same page) Runs also start in auto mode and can stop on a permission prompt "until someone answers it". ([Scheduled tasks: Permission prompts](https://code.claude.com/docs/en/routines#permission-prompts-during-a-run))

## Questions the sources don't settle

1. Whether Anthropic counts an unattended, issue-triggered fixer on a personal Pro/Max plan as "ordinary, individual usage". No source defines the phrase or gives a threshold. The Consumer Terms' "explicitly permit it" exception is never tied to the setup-token, the action or scheduled tasks.
2. How the Agent SDK being "governed by Anthropic's Commercial Terms" fits with signing it in to a consumer plan. The help center says this draws from plan limits, but no source says it is allowed. Using the CLI instead avoids the question.
3. Where a setup-token's expiry date can be read, and how to revoke a single setup-token.
4. Whether the sites (absalon first) accept requests from Railway's addresses or from Anthropic's cloud proxy. Only a test answers this, in #74 or #75.
5. Whether the official Claude GitHub App has workflow write access. The Claude Code docs and the action FAQ disagree.
6. How much plan usage one fix run takes. #74 measures it.
