# Contributing to Emdeck

Emdeck is a lightweight workspace for editing files and working with terminal
agents. Keep changes focused, explicit, and inexpensive while idle.

## Development

Install Node.js 22.12 or newer within Node 22, Bun 1.3.6, stable Rust, Git, and
the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
bun install --frozen-lockfile
bun run desktop
```

`bun run dev` runs the browser demo using sample files and simulated agents.
Read [AGENTS.md](AGENTS.md) and [Architecture](docs/ARCHITECTURE.md) before
changing ownership or lifecycle behavior. All requirements for building and
contributing are documented in this repository.

## Pull requests

Create a branch from the default branch. Explain the problem and resulting
behavior, and include a screenshot for visible changes. Add behavior tests for
new functionality; use isolated test repositories and shells. Do not include
credentials, private source, agent transcripts, or screenshots of real projects.

```sh
bun run verify
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
```

For browser tests outside Windows, install Chromium once with
`bunx playwright install chromium`. Linux CI also installs browser dependencies.
Changes to dependencies must regenerate license notices and pass the security
checks in [Release process](docs/RELEASE.md). Keep the Bun and Cargo lockfiles
committed. Never bypass checks to merge a release.

## Issues and conduct

Include Emdeck version, operating system/architecture, steps to reproduce, and
expected versus actual behavior. Reproduce using a small public or synthetic
project. Follow [Security policy](SECURITY.md) for private vulnerability
reports.

Be respectful and constructive. Harassment, discriminatory language, threats,
and publishing another person's private information are not acceptable.
Maintainers may edit or remove abusive content and limit participation. Discuss
technical disagreements with evidence and keep conversations focused on the
project.
