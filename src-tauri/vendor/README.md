# GLib iterator safety backport

`glib/` is the published GLib 0.18.5 crate, with its original MIT license and
copyright files. Tauri's Linux GTK3 dependencies require this version family.
Emdeck carries the two-line fix from
[gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343) for
[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html): the
variadic C out-pointer is passed as a mutable reference. Its local package
version is `0.18.5+emdeck.1`; this is not an upstream release.

Changes from the published crate are limited to those two lines and the local
version in the normalized `Cargo.toml`. `Cargo.toml.orig` remains the original
upstream manifest. Cargo's local `.cargo-ok` marker is omitted. The exact
supplied source inventory is recorded in `glib.files.json` and checked before
the Rust audit. Cargo-deny does not match crates.io advisories against a local
path package; the inventory, source checks and resolved graph validation are
therefore mandatory and run before every Rust audit. No GLib advisory is ignored
in `deny.toml`.

Linux CI runs an integration regression for GLib's string iterator in release mode; compiler
optimization exposes the original invalid immutable out-pointer behavior. The
upstream fix covers forward and backward iteration through the shared helper.
Remove this vendor patch when Tauri's GTK stack accepts an upstream fixed GLib
release. Do not relax the source checks or add unrelated vendor modifications.
