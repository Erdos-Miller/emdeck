# Emdeck architecture

Emdeck is one standalone desktop product, using Tauri 2/Rust, React/TypeScript,
CodeMirror and xterm. It uses the system webview and adds no indexing service,
language server or database. Its optional headless server owns ordinary CLI
processes; it does not replace their agent runtimes.

## Engineering standards

Emdeck's contributor requirements are defined in [AGENTS.md](../AGENTS.md) and
enforced by the configuration and checks in this repository:

- One-way UI → domain dependencies, injected ports and plain request/result
  types keep services independent of React and native transport.
- Typed imports, named JSX handlers and stable native identifiers make ownership
  and lifecycle behavior explicit.
- Bun 1.3.6, Node 22, layered tests, formatting and dependency guards provide a
  consistent development environment.
- Components and hooks have a 500-line limit, services 700 and tests 900, with
  no legacy exemptions.

Emdeck is a standalone product. Building, testing and contributing require no
private repositories, corporate services or production data.

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
src-tauri/runtime/        Independent session server, CLI, protocol, PTYs,
                         private storage, lifecycle evidence and SSH bridge
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

The optional Background sessions view is a client of `src-tauri/runtime`. That
independent crate owns PTYs and bounded VT screen state; desktop windows own
only connections and input leases. Native session commands scope connection IDs
to the invoking window and add its identity to input ownership. The local
capability never reaches React. SSH transports the same concurrent JSON RPC
without installing or authenticating remote software implicitly. Structural
server mutations are serialized independently of screen reads and input. The
standalone server has no Tauri dependency; Windows' embedded fallback runs from
a private copy so the IDE remains replaceable while agents work. See
[persistence and automation](PERSISTENT-AGENTS.md).

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

The merge dialog loads only the selected conflicted file. Native `git_conflicts`
reads Git's unmerged index stages and validates the index, HEAD and working-file
revision before applying a choice. Accepting a complete side handles binary
files and deletions; a manual result must be UTF-8 text without remaining
conflict markers. Applying a result stages that path without committing or
continuing the operation. Git mutations share the repository operation guard.
Oversized files, symlinks and submodules report an explicit terminal fallback
instead of attempting text conversion.

The Git feature receives a typed conflict IO port and an editor render slot.
`WorkspaceConflicts` composes the CodeMirror editor without sibling feature
imports. Manual drafts survive file selection and failed saves, and participate
in the native window's unsaved-edit check. Open editor buffers are checked
before reading and applying a resolution; unsaved tabs must be saved or closed.
Shared modal keyboard handling belongs only to the topmost dialog.

The optional terminal workspace rail filters the existing pane tree; its xterm
instances retain stable parents and keys. Saved remote profiles and view
preferences are explicit UI state. Pure connection validation and space grouping
live in the agents domain service. The typed remote command validates the
invoking window's project, builds OpenSSH argv natively, and reuses the owned
PTY lifetime. Structured multiplexer fields reject shell syntax. User-authored
custom command text is one remote argument, never evaluated by a local shell.
Remote panes do not start local provider usage probes. Browser-provider profiles
dispatch only an explicitly requested HTTPS URL through the existing
external-URL command. See [Remote sessions](REMOTE-SESSIONS.md) for capabilities
and boundaries.

Style imports retain their original cascade order. Responsive overrides load
last. Shared scrollbar styles belong in `styles/scrollbars.css`: containers use
`overflow: auto`, and thumbs are transparent until that container is hovered.
Keep gutter dimensions unchanged on hover so editors and terminals do not
resize. Vertically centered scroll content must fall back to start alignment
when it overflows, keeping both ends reachable at small pane sizes.

Linting, type checks, architecture checks and React Doctor are development
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
