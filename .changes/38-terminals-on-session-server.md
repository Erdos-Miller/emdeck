- Run every terminal on the `emdeck-session` server instead of a second PTY
  stack inside the app. Opening a project connects the window to the local
  server and registers the project folder as a workspace; panes, restarts,
  input, resizing and closing all use the session protocol. Panes that outlive
  Emdeck keep running, and reopening the project reattaches to them.
- Report Claude usage from the pane's own machine through
  `emdeck-session report-usage`, so model, context, token, cost and quota
  readings work for background and SSH-hosted agents. Codex account quotas are
  read from the CLI installed on that session's machine.
- Deliver `emdeck-session command` requests (open a file, show a diff) to the
  attached desktop view through the session protocol, once per view, with the
  same reference and path validation as before.
- Transfer pasted and dropped files to the pane's machine in bounded chunks, so
  attachments work in background and SSH-hosted panes. A pane running an SSH or
  WSL client still explains that its visible filesystem is not the local one.
- Launch SSH panes through a direct argument list, so no local shell parses the
  connection tokens.
