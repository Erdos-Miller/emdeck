#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && -n "${RUNNER_TEMP:-}" ]] || { echo 'Use a disposable GitHub runner.' >&2; exit 1; }
target=$1
version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')
test_root=$(mktemp -d "$RUNNER_TEMP/emdeck-smoke.XXXXXX")
mount="$test_root/disk"
installed="$test_root/Applications/Emdeck.app"
mkdir -p "$mount" "$test_root/Applications"
shopt -s nullglob
images=(src-tauri/target/"$target"/release/bundle/dmg/*"$version"*.dmg)
[[ ${#images[@]} -eq 1 ]] || { echo 'Expected one current DMG.' >&2; exit 1; }
if pgrep -x emdeck-ide >/dev/null; then echo 'Another Emdeck instance is running.' >&2; exit 1; fi
trap 'hdiutil detach "$mount" -quiet 2>/dev/null || true' EXIT
hdiutil attach "${images[0]}" -mountpoint "$mount" -nobrowse -readonly
ditto "$mount/Emdeck.app" "$installed"
[[ "$(defaults read "$installed/Contents/Info" CFBundleShortVersionString)" == "$version" ]]
for notice in LICENSE NOTICE THIRD_PARTY_NOTICES.md JAVASCRIPT.md RUST.md; do
  [[ -f "$installed/Contents/Resources/licenses/$notice" ]]
done
codesign --verify --deep --strict "$installed"
open -n "$installed"
app_pid=''
for attempt in {1..30}; do
  app_pid=$(pgrep -x emdeck-ide || true)
  [[ -n "$app_pid" ]] && break
  sleep 1
done
[[ "$app_pid" =~ ^[0-9]+$ ]] || { echo 'Expected one launched Emdeck process.' >&2; exit 1; }
trap 'kill "$app_pid" 2>/dev/null || true; hdiutil detach "$mount" -quiet 2>/dev/null || true' EXIT
sleep 5
kill -0 "$app_pid"
osascript -e "tell application \"$installed\" to quit"
for attempt in {1..30}; do
  kill -0 "$app_pid" 2>/dev/null || break
  sleep 1
done
if kill -0 "$app_pid" 2>/dev/null; then echo 'Application did not quit.' >&2; exit 1; fi
echo 'DMG mounted, app copied, notices/signature checked, native launch and normal quit passed.'
