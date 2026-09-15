# Privacy and local data

Emdeck has no product account, analytics service, advertising SDK, or automatic
crash-report upload. It does not index projects or upload source code itself.

Preferences, recent project paths, panel layout and saved run commands are
stored in the local webview profile. Avoid putting credentials in saved
commands; use the provider or operating system's credential facilities. Terminal
scrollback is held in memory for the session.

Every terminal runs on the session server. Closing a pane or its window ends
that process; panes left running because Emdeck exited abruptly keep running
until they are stopped. Machine profiles and view preferences are saved in the
webview profile; workspace paths, launch commands and registered provider
conversation IDs are stored in the server's private per-user directory. A random
local capability stays on the native side. Terminal output remains in bounded
memory. Remote metadata and selected screens travel through SSH. Disconnect and
Detach leave processes running; Stop ends them explicitly. See
[session storage and limits](PERSISTENT-AGENTS.md).

Git network operations, terminal commands and installed agent CLIs can send data
to their configured services. Those tools use their own authentication and
privacy policies. Emdeck does not provide a sandbox or replace those policies.
Remote Markdown images only load after a click and can contact the image host.
Opening an external link launches the system browser.

The optional Claude metrics integration converts the status line into an
allowlisted set of metrics inside the pane and sends only those to the session
server, which holds them in memory for that pane. Nothing else from that payload
is kept, and a temporary settings folder holding the status-line command is
removed with the process. Codex account usage is read through the authenticated
CLI installed on that session's machine and may contact its provider. Automatic
quota refresh is opt-in. Neither integration copies credentials or transcripts
into the agent overview; activity labels are terminal-output heuristics.

The internal application identifier remains `dev.relay.ide` for existing local
preferences. Webview/profile locations differ by platform. Uninstallers may keep
this data unless removal is explicitly selected. Back up preferences before
manually removing the application profile. Browser preview data is separate and
can be cleared using the browser's site-data controls.

When sharing bug reports, inspect logs and screenshots for paths, commands,
terminal output, personal data, and secrets before posting them publicly.
