# Security policy

## Reporting a vulnerability

Use **Security → Report a vulnerability** in the GitHub repository to send a
private report to the maintainers. Include affected versions, reproduction
steps, impact, and a minimal synthetic example. Do not post credentials, private
repository content, or an unpatched exploit in a public issue.

If private reporting is unavailable, open an issue asking maintainers to enable
it, without disclosing the vulnerability. No response-time guarantee is offered
during the initial beta.

## Supported versions

Security fixes target the newest public beta. Earlier development builds are
unsupported; upgrade before reporting a problem. Releases describe known
limitations and the signing status of their downloads.

## Trust boundary

Emdeck is a local development tool. Commands, Git hooks, shells and agent CLIs
execute with your operating-system permissions; they are not sandboxed by the
IDE. Open trusted projects and review commands before running them. Opening a
project does not automatically run its scripts or agents.

Native file commands check the invoking window's authorized project root, reject
traversal and symlink escapes, and protect Git metadata. Saves detect external
changes, but another process can still race filesystem operations. These checks
are not a sandbox against other local processes.

Markdown does not execute raw HTML. External images require an explicit click,
and external links are restricted to HTTP/HTTPS. Agent metrics depend on the
installed provider CLI. See [Privacy](docs/PRIVACY.md).

## Dependency policy

CI runs JavaScript vulnerability checks, Rust advisory/license/source checks,
and redacted source/history secret scans. Source scans use Git's publication
inventory, including force-tracked ignored files; untracked credentials and
build outputs are excluded. Neither source nor history scans have path
exemptions, ignore-file suppressions or inline allow comments. Publication
symlinks require explicit review rather than following them into local data.
Screenshots and documentation must also be reviewed for private information that
credential patterns cannot identify. Dependency updates are proposed weekly.
Reviewed upstream maintenance notices are documented in
[Dependency review](docs/DEPENDENCIES.md); vulnerabilities are not silently
excluded to pass a build.
