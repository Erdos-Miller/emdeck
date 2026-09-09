# Dependency review

Reviewed for the first public beta candidate on 2026-09-09.

## JavaScript

Vitest was upgraded from 3.2.7 to 4.1.11 to address
[GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9). This
was a development-server/test-mocking advisory, not an identified runtime
exploit in the packaged IDE. The upgraded unit and integration tests pass.
`bun audit` is a blocking CI check, including development dependencies.

## Rust

The four-target audit found maintenance advisories for the following transitive
dependencies. The reviewed graph has no compatible replacement for these
packages through Tauri.

GitHub additionally identified
[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) in
GLib 0.18.5. The initial audit's default excluded transitive unsoundness
notices; `unsound = "all"` now makes these blocking. Tauri's Linux GTK3 stack
requires this GLib version family, so Emdeck vendors the published crate with
the upstream two-line iterator fix as `0.18.5+emdeck.1`. See
[the backport record](../src-tauri/vendor/README.md). The audit verifies source
hashes and the resolved Cargo graph because cargo-deny does not match registry
advisories against local path packages. Linux CI exercises the existing iterator
tests with optimization. No GLib advisory is ignored in the audit configuration.

| Advisory                                                              | Package            | Dependency path                       |
| --------------------------------------------------------------------- | ------------------ | ------------------------------------- |
| [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370) | proc-macro-error   | Linux GTK3 build macros through Tauri |
| [RUSTSEC-2025-0075](https://rustsec.org/advisories/RUSTSEC-2025-0075) | unic-char-range    | Tauri utilities → urlpattern          |
| [RUSTSEC-2025-0080](https://rustsec.org/advisories/RUSTSEC-2025-0080) | unic-common        | Tauri utilities → urlpattern          |
| [RUSTSEC-2025-0081](https://rustsec.org/advisories/RUSTSEC-2025-0081) | unic-char-property | Tauri utilities → urlpattern          |
| [RUSTSEC-2025-0098](https://rustsec.org/advisories/RUSTSEC-2025-0098) | unic-ucd-version   | Tauri utilities → urlpattern          |
| [RUSTSEC-2025-0100](https://rustsec.org/advisories/RUSTSEC-2025-0100) | unic-ucd-ident     | Tauri utilities → urlpattern          |

`deny.toml` acknowledges only these exact maintenance IDs with reasons. All new
advisories remain blocking. Unused acknowledgments fail CI, so they must be
removed when an upstream update eliminates the dependency. Review this table
with every Tauri update and before each release; an acknowledgment is not a fix
for abandoned upstream maintenance.

## Licenses and source availability

JavaScript release tooling checks SPDX expressions for installed production and
development packages and gathers full supplied notices for production packages.
Rust tooling checks all planned target graphs and includes native/build notices.
MPL-2.0 dependencies remain unmodified; the notices link to their corresponding
source crate archives. Creative Commons attribution data in development tooling
is not bundled into the IDE. Review any newly introduced license before adding
it to an allowlist.

The generated reports cover package-manager dependencies. Platform system
components and libraries added by AppImage bundling require a packaging review;
do not treat these reports as an inventory of every byte in an installer.
Tauri's distribution dependencies and separately installed Git/agent CLIs retain
their own license terms.
