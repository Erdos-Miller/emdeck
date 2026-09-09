#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && -n "${RUNNER_TEMP:-}" ]] || { echo 'Use a disposable GitHub runner.' >&2; exit 1; }
test_root=$(mktemp -d "$RUNNER_TEMP/emdeck-smoke.XXXXXX")
for notice in LICENSE NOTICE THIRD_PARTY_NOTICES.md JAVASCRIPT.md RUST.md; do
  notice_path=$(dpkg-query -L emdeck | awk -v suffix="/licenses/$notice" 'substr($0, length($0) - length(suffix) + 1) == suffix { print; exit }')
  [[ -n "$notice_path" && -f "$notice_path" ]] || { echo "Missing installed notice: $notice" >&2; exit 1; }
done
export XDG_CONFIG_HOME="$test_root/config" XDG_CACHE_HOME="$test_root/cache" XDG_DATA_HOME="$test_root/data"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME"
openbox > "$test_root/window-manager.log" 2>&1 &
manager_pid=$!
app_pid=''
trap 'if [[ -n "$app_pid" ]]; then kill "$app_pid" 2>/dev/null || true; fi; kill "$manager_pid" 2>/dev/null || true' EXIT
emdeck-ide > "$test_root/application.log" 2>&1 &
app_pid=$!
window_id=''
for attempt in {1..60}; do
  kill -0 "$app_pid" || { cat "$test_root/application.log"; exit 1; }
  # The window manager initializes asynchronously; an absent client list is
  # expected during startup, and the bounded loop retries it.
  window_id=$(wmctrl -lp 2>/dev/null | awk -v pid="$app_pid" '$3 == pid { print $1; exit }' || true)
  [[ -n "$window_id" ]] && break
  sleep 1
done
[[ -n "$window_id" ]] || { cat "$test_root/application.log"; echo 'No native window.' >&2; exit 1; }
sleep 5
kill -0 "$app_pid"
wmctrl -ic "$window_id"
for attempt in {1..30}; do
  kill -0 "$app_pid" 2>/dev/null || break
  sleep 1
done
if kill -0 "$app_pid" 2>/dev/null; then echo 'Application did not close.' >&2; exit 1; fi
wait "$app_pid"
app_pid=''
echo 'Installed Ubuntu package opened a native window and exited cleanly after a window-close request.'
