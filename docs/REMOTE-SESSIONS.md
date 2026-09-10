# Terminal workspaces and remote sessions

This guide covers external multiplexer/provider connections. For Emdeck-owned
background sessions and aggregated local/remote inventories, see
[Emdeck session server](PERSISTENT-AGENTS.md).

Choose **Workspaces** in the terminal toolbar to use the optional spaces rail
and session tabs. **Panes** restores the existing terminal layout. This
preference persists, and changing it does not restart terminals or discard
editor state. Spaces group this window's local terminals by working directory
and remote terminals by saved connection. Other project windows keep their own
sessions.

Select a space to see its terminals together; select a session to focus it, or
choose **Split view** to see the space's panes. Search and **Needs attention**
help find local agents. Existing local context readings are shown when
available. View changes, filtering, and hiding the terminal panel do not
disconnect sessions.

New terminals automatically reveal their space. The agent-overview button
returns to **Panes** with the existing customizable local metrics panel open.

## Configure a connection

Use the monitor button beside the view selector, or **Configure** in the spaces
rail. Add a connection and save it. Click **Connect** to attach an SSH terminal,
or **Open in browser** for a provider session. Saving a profile and opening
Emdeck never start a connection, agent, server, or remote installer
automatically.

| Connection                        | Where you control it                                                                  | Lifetime after disconnect                                         |
| --------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| cmux TUI over SSH                 | Existing cmux session, including its workspaces and agents, inside an Emdeck terminal | The headless cmux session stays running                           |
| tmux over SSH                     | Existing tmux session inside an Emdeck terminal                                       | The tmux server and session stay running                          |
| SSH shell / custom remote command | Remote shell or command inside an Emdeck terminal                                     | Depends on the remote command; an ordinary shell/process may stop |
| Claude Remote Control             | Official Claude web interface in your browser                                         | Controlled by Claude and the process on the original machine      |
| Other provider session            | Saved HTTPS session URL in your browser                                               | Controlled by the provider                                        |

### SSH and multiplexers

Install OpenSSH on the Emdeck machine and configure access to the remote
machine. Use a host alias from your SSH config or `user@hostname`. Leaving
**Port** blank uses SSH configuration. Put identity files and jump-host settings
in SSH config; Emdeck does not read your private keys or store SSH passwords.
The SSH client shows host-key/password/passphrase prompts in its terminal. A
changed host key is not silently accepted. Agent forwarding and connection
forwarding are disabled.

For cmux TUI, start a named headless session on the remote machine following the
[cmux TUI documentation](https://cmux.com/docs/tui), then configure its name
(for example `agents`). The remote binary defaults to `cmux`; use `cmux-tui` or
an absolute POSIX path if that is how it is installed. This adapter uses
`cmux attach --session agents`. It targets **cmux TUI**, not the native macOS
cmux app's separate socket API.

For tmux, create the session on the remote machine, for example
`tmux new-session -s agents`, and launch Claude or Codex inside it. Emdeck uses
`tmux attach-session -t =agents` to select the exact session without evicting
other clients. See the
[tmux manual](https://github.com/tmux/tmux/blob/master/tmux.1).

Both adapters attach to an existing server; they never create, upgrade, or kill
one. Closing the Emdeck pane kills the local SSH client, leaving the remote
multiplexer responsible for its processes. After a network failure, use
**Reconnect remote session**. Emdeck does not automatically retry a connection.

The terminal adapters are usable from Windows, macOS and Linux clients with
OpenSSH. The host must support the selected multiplexer. The SSH shell/custom
command option uses the host's default shell and can run Windows PowerShell/cmd
or POSIX commands as appropriate. Custom command text executes **on the remote
machine**, explicitly when connecting or reconnecting. It may start a new
process; it does not retroactively attach to an ordinary terminal already
running there.

### Claude Remote Control and other providers

In an existing Claude Code session, enable `/remote-control`, then save its
`https://claude.ai/code/...` link as a **Claude Remote Control** connection.
Opening it uses Claude's official browser UI and account authentication. Emdeck
does not implement a private Claude control protocol or collect its account
tokens. See
[Claude's Remote Control documentation](https://code.claude.com/docs/en/remote-control)
for current availability, setup and lifetime requirements.

Codex CLI sessions can run inside either multiplexer and be controlled through
the SSH terminal. **Other provider session** can save an existing provider web
session URL, but a URL shortcut does not expose that session to Emdeck's
terminal or usage APIs. A native Codex App Server client would be a separate
integration using the
[documented App Server protocol](https://learn.chatgpt.com/docs/app-server);
this feature does not connect to or discover App Servers.

## Status, usage and privacy

**SSH client running** describes the local transport process, not successful
authentication or a remote agent's lifecycle. Connection errors and remote
prompts appear in the terminal. Individual remote agents and provider usage
remain in their multiplexer/provider interface; they are not currently
aggregated into Emdeck's local agent cards or attention filter. Local Codex
account usage is never applied to remote sessions. Browser links have no live
status in Emdeck.

Saved profiles contain names, SSH destinations, session/binary names, optional
remote commands, or HTTPS URLs in local preferences. Do not put passwords or
secret tokens in saved commands or links. Profile removal does not contact a
machine; disconnect its pane before editing or removing the saved connection.
The active pane uses a snapshot of its connection settings.

## Validation scope

Unit/native tests validate profile recovery, grouping, remote arguments, exact
tmux session selection, host-key/forwarding policy and rejection of option/shell
injection in structured fields. Browser tests exercise session preservation,
explicit connection, output/input, retry/disconnect isolation, persistence,
validation errors and provider URL dispatch with a simulated desktop transport.
Native Windows acceptance checks the actual OpenSSH launch/error path against a
loopback peer that closes before authentication. No real remote machine,
provider account or private session is used as a test fixture. Live end-to-end
cmux/tmux authentication and provider login require validation with your
configured hosts and accounts.
