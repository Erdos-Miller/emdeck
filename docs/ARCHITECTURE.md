# Emdeck architecture

Emdeck is one standalone desktop product, using Tauri 2/Rust, React/TypeScript,
CodeMirror and xterm. It uses the system webview and adds no indexing service,
language server, database or agent runtime.

## Standards reviewed

The reference was the Erdos Miller internal monorepo, specifically:

- `AGENTS.md`: package boundaries, typed imports, named JSX handlers,
  validation, process portability and code-size limits.
- `standards/README.md` and `standards/AGENTS.md`: service-first architecture,
  typed contracts, React adapters and independent service tests.
- `product/toolhub/src/app/_services/domain/README.md`: one-way UI → domain
  dependencies, injected ports and plain request/result types.
- `product/toolconnect/AGENTS.md`: native product boundaries and stable internal
  identifiers across branding changes.
- Root `package.json`, ESLint/Prettier configuration, and
  `scripts/code-size-ratchet/policy.json`: Bun 1.3.6, Node 22, test tiers,
  formatting, dependency guards and 500/700/900 line limits.

The reference repository was inspected, not modified. Emdeck remains in this
workspace. If adopted into the monorepo, its natural product boundary is
`product/emdeck`; relocation and monorepo pipeline registration are separate
work.

ToolHub's Supabase, Next.js, TanStack Query, shared themed UI, database tests
and application-specific localization rules are scoped to those products. Emdeck
uses native commands in place of database adapters and keeps its own desktop UI.
It does not need the monorepo's services or production data to build or test.

## Ownership and dependencies

```text
src/
  App.tsx                 Application view composition
  app/
    components/           Workspace chrome and cross-feature view composition
    hooks/                Window lifecycle and workspace action coordination
  features/
    agents/               Terminal sessions, agent cards and usage presentation
    editor/               Documents, CodeMirror and Markdown
    explorer/             Lazy file tree
    git/                  Branches, changes, comparisons and worktrees
    projects/             Project picker and startup preferences
    runs/                 Discovery, custom commands and history
    settings/             Preferences and themes
  shared/
    contracts/            Serializable data, dialog and IPC contracts
    lib/                  Neutral path helpers
    ui/                   Domain-independent dialog and file-icon primitives
  platform/
    desktop/              Typed Tauri transport
    preview/              Explicit browser demo adapter
    storage/              Resilient local preference persistence
  styles/                 Styles split by ownership; ordered from styles.css
src-tauri/src/
  lib.rs                  Registration and application startup
  commands/               Window authorization, IPC arguments and dispatch
  services/               Files, Git, worktrees, PTYs, Markdown and usage
  state/                  Per-window project authorization and lifetime
tests/
  unit/                   In-memory services and transformations
  integration/            Real local process execution
  e2e/                    Browser workflows and typed desktop fixtures
```

The app composes features. Features cannot import another feature or the app.
Domain services depend on plain contracts, neutral helpers and their own service
modules; React and platform IO stay outside. Platform adapters depend on shared
contracts, never on views. These rules apply to type imports and dynamic
imports, and cycles are rejected by `architecture:check`.

`useWorkspaceState` owns one window's coordinated workspace state. The action
hooks accept explicit `Pick` contracts rather than importing a global mutable
store. This keeps project replacement, active tabs and unsaved-file protection
coordinated without adding a state-management runtime. Smaller feature services
handle document reconciliation and run discovery through typed inputs/ports.

`shared/contracts/desktop.ts` maps each command to its argument and result
types. The bridge infers results from command names; callers cannot invent a
response type. The architecture check compares that command list with Rust
registration. Rust remains authoritative for access control, revision checks,
Git locking and terminal ownership. The check catches name drift, not every
Rust/TS field-type change; native tests and browser adapter tests cover payload
behavior.

## Lifetime and performance

Opening a second project defaults to a new native window. Replacement resets
that window's views only after the existing confirmation flow. Native project
roots and terminal groups are keyed by the invoking window, not
renderer-provided IDs.

Terminal launch inputs are sampled when its identity/restart counter changes.
Appearance updates reconfigure the existing terminal. Hidden and maximized panes
remain mounted. CodeMirror samples a document on tab switches and separately
applies content/theme updates, preserving per-file undo history.

Run discovery reads only the root listing and `package.json`. Its injected IO
port makes cancellation and read limits testable without launching an app.
Document reconciliation uses the current buffer when a read completes, keeping
edits made while IO was pending. Git remains explicit or focus-triggered.

Style imports retain their original cascade order. Responsive overrides load
last. Linting, type checks, architecture checks and React Doctor are development
tools; none run inside the shipped IDE or analyze projects opened by its users.

## Validation commands

```sh
bun install --frozen-lockfile
bun run check
bun run test:unit
bun run test:integration
bun run test:native
bun run test:e2e
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
bun run desktop:build
```

`bun run verify` runs the frontend checks and all test tiers. `npm run` aliases
remain usable, but dependency installation uses the single Bun lockfile. The
GitHub workflows build native targets on Windows, macOS and Linux. Browser tests
use Edge on Windows; they run against Vite preview of a production build, so
source edits cannot change the application midway through a test.

React Doctor is an additional advisory audit, pinned to 0.9.13. Disable its
score, telemetry and supply-chain network checks; review diagnostics alongside
ESLint, behavioral tests and the application lifetime requirements. See the
validation log for the audit outcome and [the React audit](REACT-AUDIT.md) for
the command and remaining recommendations.

Sources: the local standards above and
[React Doctor's upstream CLI](https://github.com/millionco/react-doctor).
