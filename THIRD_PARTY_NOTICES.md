# Third-party software

Emdeck incorporates open-source libraries. Their licenses and copyright notices
remain applicable independently of Emdeck's own license.

- [JavaScript production packages](docs/licenses/JAVASCRIPT.md)
- [Rust native and build dependencies](docs/licenses/RUST.md)

These files are generated from the locked dependency graph and included with
installers. They include upstream license text and source-package references.
Emdeck carries a GLib iterator safety backport, documented with original source
provenance in [src-tauri/vendor/README.md](src-tauri/vendor/README.md). Other
dependency packages remain unmodified. Where multiple licenses are offered, the
recorded license selection applies to this distribution.

System components such as WebView2, WebKitGTK, operating-system libraries, Git,
and independently installed agent CLIs have their own licenses. Emdeck does not
bundle the AI agents or their subscriptions. The Ubuntu beta is a `.deb` package
and uses the distribution's separately installed libraries. This release does
not distribute an AppImage or a bundled WebKitGTK runtime.

The Emdeck name and EM monogram identify this project; the source-code license
does not grant rights to imply endorsement by Erdos Miller.
