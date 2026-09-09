# Emdeck 0.1.22 unsigned beta — validation record

Source: `de678ca2d2f0c982fb4d1cc4190fc4d8d0f2085c`. Date: 2026-09-09. License:
Apache-2.0, copyright Erdos Miller.

These tests use synthetic projects and shells, with no user repository or
authenticated provider account as a fixture.

## Automated checks

Local Windows checks passed: 41 unit tests, one Bun integration, 31 native
tests, 53 browser workflows, ESLint, TypeScript, Prettier, architecture/size
checks, Rust formatting and Clippy. The added native test proved that tools and
overrides in the launching process's environment reach real Windows terminals.
It failed before the fix and passed afterward without editing the user's PATH or
registry.

All four platform checks, security/license checks and installer jobs passed on
the release commit in
[Draft release run 34405140636](https://github.com/Erdos-Miller/emdeck/actions/runs/34405140636).
The separate
[main-branch check](https://github.com/Erdos-Miller/emdeck/actions/runs/34405137806)
also passed.

JavaScript audit, source/history secret scans, Rust advisory/license/source
checks, vendored GLib verification and notice regeneration passed. The six
reviewed upstream maintenance advisories remain documented in
`docs/DEPENDENCIES.md`; no security vulnerability was waived. The unchanged
React code was audited with React Doctor 0.9.13: four documented false positives
and 53 advisory warnings.

## Native application and installers

The final 0.1.22 local native application passed the full acceptance workflow.
An actual 0.1.19 executable and then 0.1.22 used the same isolated profile: last
project, Light theme, layout settings and a saved document were preserved; both
versions closed normally. This checks profile compatibility, not an in-place
upgrade using the older NSIS installer.

| Installer               | Test environment    | Result                                                                                              |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| Windows x64 NSIS        | Windows Server 2025 | Install, native UI workflows, same-version reinstall/data retention, normal close, uninstall passed |
| macOS Apple Silicon DMG | macOS 15.7.9        | Mount, copy app, verify notices/ad-hoc signature, native launch and normal quit passed              |
| macOS Intel DMG         | macOS 15.7.9        | Mount, copy app, verify notices/ad-hoc signature, native launch and normal quit passed              |
| Linux x64 .deb          | Ubuntu 24.04.5      | Install, native window under Xvfb/Openbox, normal close and package removal passed                  |

The original tagged native test passed in CI. A local run exposed a test race:
WebView2 changed DOM scrollTop before xterm processed the wheel event. The test
now waits for visibly rendered history before changing layout. The final local
acceptance passed with that synchronization, against the unchanged release
binary. This is a test-only follow-up; installer source remains the commit
above.

The native Windows workflow checks project restoration, file save and
external-edit protection, Markdown, Git diff tabs, worktree creation/opening/
removal, independent project windows, a detected Bun command, six real PTYs and
normal shutdown. Streaming checks cover repeated layout changes, continued
visible output and preserving deliberate scrollback. The Windows installer test
also checks same-version reinstall/data retention and uninstall.

Browser workflows use Chromium on macOS/Linux. Those checks are separate from
the native DMG/.deb launch tests and do not claim full native-WebView
interaction coverage on those platforms.

## Endurance evidence and exact scope

The two-hour native backend soak **passed** (7,200.19 seconds test runtime).
Every pane advanced in all 119 minute-by-minute progress reports and produced
approximately 7.8 MB of PTY data. All resize/shutdown assertions passed, all six
exit events arrived, and the session map was empty. The test process and its
direct children were absent after completion.

This run began before the 0.1.21 version bump, using the terminal backend that
remained unchanged through that candidate. In 0.1.22, the only production change
to that backend is preserving Windows environment overrides when starting a
shell. Reading, resizing, session lifetime and shutdown code remain unchanged.
The new launch behavior is tested separately on the final release. This record
does not represent the earlier two-hour run as a new 0.1.22 binary test.

Memory sampling covered 77.84 minutes (78 samples), beginning partway through
the backend soak. Native test-process private memory remained 2.23 MiB in every
sample. The full test/shell/console-host tree ranged from 411.87 to 415.77 MiB
private memory and 824.71 to 828.95 MiB summed working set. This is not a claim
of zero leaks or a full two-hour memory trace.

The 45-minute 0.1.21 GUI soak **passed**: all six views advanced in all 46
observations, including after eight layout/hide/show cycles. Each pane reached
over 43,000 output lines. There were no renderer errors, no remounted sessions,
and all 19 recorded test processes exited after normal closure.

Its 471 process-tree samples averaged 91.02% of one logical CPU core (about
4.55% when normalized across this machine's 20 logical processors), 907.00 MiB
private memory, and 1667.23 MiB summed working set. After minute 20, private
memory ranged from 903.34 to 1020.88 MiB, ending at 927.48 MiB. This
continuously repainting synthetic workload includes six PowerShell/console
processes and WebView2; it is not an idle measurement or a claim about the cost
of real provider agents.

The final **0.1.22** backend also passed a separate five-minute six-PTY soak.
All streams advanced, all resizes succeeded, and all shells exited with the
session map empty. This run includes the corrected Windows launch environment.

The separate long GUI soak uses the local optimized **0.1.21** executable
(SHA-256 `6ee326c71612463aafec158ecf198a90698aadc56ce640d2b28d1416dd7744bd`),
six real streaming PowerShell panes, a visible WebView2 window and repeated
layout/hide/show changes. Its renderer is unchanged in 0.1.22. Each pane has the
default 3,000-line scrollback. The test records rendered sequence numbers every
minute, checks component/session continuity and checks normal terminal/app
closure. Raw whole-process-tree CPU and memory samples accompany the result.

## Final 0.1.22 idle observations

Two visible-window measurements ran for 120 seconds each, with 21 samples each.
They use the local optimized 0.1.22 executable, SHA-256
`b1c19ddfe022de0bb290e335caf0cc02c001663ffd1c0118af27240dae495067`. This local
build is distinct from the CI installer, whose checksum is in `SHA256SUMS.txt`.

| Workload                                         | Mean CPU (% of one logical core) | Mean private memory | Mean summed working set |
| ------------------------------------------------ | -------------------------------: | ------------------: | ----------------------: |
| Welcome screen, no project or terminals          |                            0.40% |          218.84 MiB |              518.32 MiB |
| Synthetic project, six idle PowerShell terminals |                            1.42% |          696.10 MiB |             1443.42 MiB |

The six-terminal process tree includes the shell/console hosts and WebView2.
These measurements completed before the original local test's scroll-event race;
the later corrected acceptance test passed against the same executable. Raw
samples and summaries are attached in `validation-data.zip`.

## Measurement scope and limitations

Local hardware: Windows 11 Pro 10.0.26200, Intel Core Ultra 7 265F (20 logical
cores), 128 GiB RAM. Other development applications were running. Local tools:
Node 22.21.1, Bun 1.3.6, Rust 1.94.1. WebView2 152.0.4191.66.

CPU percentages refer to one logical core. Working-set sums can double-count
shared pages and are not incremental machine RAM usage. Measurements include the
application and attached WebView/shell descendants, where stated. No real AI
provider was running. Results are observations, not universal performance
requirements or comparisons with other IDEs. The earlier 0.1.20 idle/six-idle-
terminal baseline remains separately labeled in `docs/PERFORMANCE.md`.

Windows downloads are unsigned; macOS uses ad-hoc signing without notarization.
OS/device policy may prevent launching these beta builds. Linux downloads are
Ubuntu x64 `.deb` packages; AppImage is deferred pending a separate bundled
system-library review. Auto-update, recovery of unsaved documents after crashes
and agent reattachment after restarting the app are not included. Provider usage
fields depend on the installed CLI and account.
