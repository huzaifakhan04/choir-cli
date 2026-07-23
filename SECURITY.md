# Security Policy

Choir takes security seriously — it streams a live coding session between teammates, so we care a great deal about keeping that data safe. Thank you for helping keep Choir and its users secure.

## Supported versions

Choir is under active development. Security fixes are released for the latest published versions:

| Component | Version | Supported |
|-----------|---------|:---------:|
| `choir-cli` (npm) | 0.2.x | ✅ |
| `choir` plugin | 0.2.x | ✅ |
| Older / pre-release | < 0.2 | ❌ |

Always run the latest release. Update the plugin with `/plugin marketplace update choir` and the CLI with `npm i -g choir-cli@latest` (or just `npx choir-cli`, which fetches the latest).

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, report them privately through GitHub's built-in mechanism:

👉 **[Report a vulnerability](https://github.com/huzaifakhan04/choir-cli/security/advisories/new)** (Security → Advisories → *Report a vulnerability*)

If you're unable to use GitHub Security Advisories, you can reach the maintainer via their [GitHub profile](https://github.com/huzaifakhan04).

Please include, as best you can:

- A description of the vulnerability and its impact
- Steps to reproduce (a proof of concept is ideal)
- The affected component and version (`choir-cli`, the plugin, or the relay)
- Any suggested remediation

### What to expect

- **Acknowledgement** within a few days.
- An assessment and, if confirmed, a fix or mitigation as quickly as is practical.
- Credit for your report in the release notes, if you'd like it.

Please give us a reasonable window to address the issue before any public disclosure. We're grateful for coordinated disclosure.

## Scope

In scope:

- The **relay** (`relay/`) — auth, token handling, session isolation, data exposure.
- The **plugin** (`plugin/`) — the on-host **secret redaction** filter, and anything that could leak host data or let a remote party act beyond their scope.
- The **CLI** (`cli/`) — token handling and anything that could compromise a viewer's machine.

Out of scope:

- Vulnerabilities in third-party platforms Choir runs on (Cloudflare, Claude Code, npm) — please report those to the respective vendor.
- Findings that require an already-compromised host machine.

## The trust model

Choir v1 is designed for **one trusted team** and self-hosted relays. Understanding the model helps you assess impact — please read [`docs/security.md`](docs/security.md), which covers what Choir protects against (on-host redaction, remote steers that can't bypass local permission prompts, per-session tokens) and, honestly, what it does not.
