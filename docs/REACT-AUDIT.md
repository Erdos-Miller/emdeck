# React audit — 0.1.19

## Unreleased — conflict resolution modal

React Doctor 0.9.13 reports the same four reviewed Worktrees false positives and
63 advisory warnings. The new merge UI was split into the file dialog,
version/result panes, footer and a hook with an injected IO port. Duplicate path
filtering was removed. The remaining two new advisories concern the dialog's
conditional actions and selection reconciliation after Git refreshes. Selection
changes are deferred while saving or holding an unsaved draft; native index and
file revisions still guard every write. Browser tests cover draft retention,
error recovery, nested close dialogs and small windows. No audit rule was
suppressed or size budget increased.

## Unreleased — background session server

React Doctor 0.9.13 reports four previously reviewed Worktrees false positives
and 61 advisory warnings. The three new findings concern list iterations and
array lookups in `SessionDesk` and `useSessionMachines`, bounded to 16 machine
profiles and 64 panes per server. They are retained as optimization advice.
Input is serialized, pane identities remain stable across view/layout changes,
and the server view loads only when selected. Mandatory architecture, size, lint
and behavioral checks remain separate; no rules or limits were relaxed.

## Unreleased — terminal workspaces and remote connections

React Doctor 0.9.13 was repeated with the same options for the optional spaces
rail, connection manager, and terminal integration. It reports the same four
reviewed `Worktrees.tsx` false positives and 58 advisory warnings. Five warnings
were added: complexity in `ConnectionForm`, and complexity/size in
`TerminalPanel` and `TerminalPane`. These components remain within the mandatory
500-line budget. Connection validation, persistence, and native SSH construction
have separate ownership; the panel composes the views without moving or
recreating live terminals. Browser and native lifetime checks cover that
boundary. The findings are retained as maintainability advice, with no rule
suppression or budget changes.

## 0.1.21 follow-up

The same pinned audit was repeated for the terminal fitting change: four
previously reviewed errors remain, with 53 advisory warnings. The additional
warning is `plugin-update-trust-risk` in the manual Windows installer review
workflow. It downloads and executes the maintainer-selected artifact from this
repository in a disposable GitHub runner, verifies its version/target, and uses
read-only repository/actions permissions. That execution is the purpose of the
installer test; it is not an application updater or an automatic PR download. No
warning or error rule was suppressed.

## Architecture audit

React Doctor 0.9.13 was run against the saved pre-refactor source and the final
source, with score, telemetry and supply-chain network checks disabled. Both
scans completed. The baseline was an isolated temporary checkout so the parent's
ignored backup folder would not cause a misleading zero-file scan.

| Scan                    | Source files | Reported errors | Warnings |
| ----------------------- | -----------: | --------------: | -------: |
| Original architecture   |           26 |              11 |       51 |
| Refactored architecture |           89 |               4 |       52 |

Render-time ref mutations were removed. `useLatest` publishes values in a layout
effect, giving event handlers and asynchronous IO the last committed values.
Terminal initialization and editor document switching remain separate from live
appearance/content updates. The browser regression suite covers their lifetime
behavior, including rename, hide, layout changes, undo history and close flows.

The four remaining error-level diagnostics are reviewed false positives in
`Worktrees.tsx`: the checker treats callbacks passed to its normal async `run`
helper as React state updaters. That helper invokes its callback once inside a
guarded operation; it does not pass it to a React setter. No rule was disabled.
Creation, removal, failed creation/window opening and retry are covered by the
worktree workflows.

Warnings remain for accessibility of dismissing overlays, larger view functions,
effect-driven adapter state, render helpers and small iteration/formatting
optimizations. This is an advisory report, not a claim of zero findings. The
mandatory lint, type, size and dependency checks are separate and pass without
exemptions. Splitting code changes the checker’s warning locations and counts;
warnings should be reviewed by behavior rather than hidden to reach a score.

To repeat the audit in PowerShell:

```powershell
$env:REACT_DOCTOR_NO_TELEMETRY = '1'
npm exec --yes --package=react-doctor@0.9.13 -- react-doctor . --no-score --no-supply-chain --no-parallel --yes --json --json-out .tmp/react-doctor.json --blocking none
```

On macOS/Linux, prefix the same `npm exec` command with
`REACT_DOCTOR_NO_TELEMETRY=1`. This audit installs no agent hooks or application
runtime dependencies. It is not run inside Emdeck against opened projects.

CLI reference: [React Doctor](https://github.com/millionco/react-doctor).
