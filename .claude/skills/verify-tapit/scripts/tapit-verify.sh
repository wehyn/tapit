#!/usr/bin/env bash
# Tapit local-demo verification helper.
#   tapit-verify.sh launch            start the dev server on 127.0.0.1:3000 (demo, local storage) and wait for it
#   tapit-verify.sh doctor            read-only check: is the 3000 instance ours, demo mode, pages usable
#   tapit-verify.sh prove <title> <run-id>
#                                     run one feature journey via npm run test:e2e:demo (Playwright owns 127.0.0.1:3001)
#   tapit-verify.sh stop              stop the 3000 dev server this helper started (never by process name)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PORT=3000
BASE="http://127.0.0.1:$PORT"
EVIDENCE="$ROOT/test-results/verify-tapit"
STATE="$EVIDENCE/state"
PIDFILE="$STATE/dev-$PORT.pid"
DEVLOG="$STATE/dev-$PORT.log"

usage() {
  sed -n '2,8p' "${BASH_SOURCE[0]}" >&2
  exit 2
}

cd "$ROOT"

port_free() {
  node --input-type=module -e "import net from 'node:net'; const probe = net.createServer(); probe.once('error', () => process.exit(1)); probe.listen($1, '127.0.0.1', () => probe.close(() => process.exit(0)));"
}

# Read-only. Prints one JSON line and exits 0 only when the loopback app is in demo mode and usable.
doctor_quiet() {
  node --input-type=module -e '
    const base = process.argv[1];
    try {
      const [contract, home, login] = await Promise.all([
        fetch(`${base}/api/live-contract`),
        fetch(base),
        fetch(`${base}/login`),
      ]);
      const mode = await contract.json().catch(() => ({}));
      const html = await home.text();
      const ok = contract.ok && mode.mode === "demo" && home.ok && html.includes("Share with a tap") && login.ok;
      console.log(JSON.stringify({ ok, mode: mode.mode ?? null, home: home.status, login: login.status }));
      process.exit(ok ? 0 : 1);
    } catch (error) {
      console.log(JSON.stringify({ ok: false, error: error.cause?.code ?? error.message }));
      process.exit(1);
    }
  ' "$BASE"
}

launch() {
  mkdir -p "$STATE"
  if ! port_free "$PORT"; then
    echo "127.0.0.1:$PORT is occupied. Identify the listener (lsof -nP -iTCP:$PORT -sTCP:LISTEN); do not drive it." >&2
    exit 1
  fi
  NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_DEMO_STORAGE=local \
    setsid npm run dev -- --hostname 127.0.0.1 --port "$PORT" >"$DEVLOG" 2>&1 &
  echo $! >"$PIDFILE"
  for _ in $(seq 1 120); do
    if doctor_quiet >/dev/null 2>&1; then
      echo "ready: $BASE (pid $(cat "$PIDFILE"), log $DEVLOG)"
      return 0
    fi
    sleep 1
  done
  echo "not ready after 120s; see $DEVLOG" >&2
  exit 1
}

doctor() {
  local status=0
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "owner: started by this helper (pid $(cat "$PIDFILE"))"
  else
    echo "owner: no live pidfile from this helper; $BASE is not ours to drive" >&2
    status=1
  fi
  doctor_quiet || status=1
  return "$status"
}

prove() {
  local title="${1:-}" run="${2:-}"
  if [[ -z "$title" || -z "$run" ]]; then usage; fi
  # Next allows one dev server per checkout (.next lock), so Playwright's own 3001 server cannot start while ours runs.
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "the $PORT dev server from launch is running and holds the .next lock; run: tapit-verify.sh stop" >&2
    exit 1
  fi
  local dir="$EVIDENCE/$run"
  if [[ -e "$dir" ]]; then
    echo "run directory already exists: $dir; choose a new run id" >&2
    exit 1
  fi
  mkdir -p "$dir"
  touch "$dir/.started"

  set +e
  PLAYWRIGHT_JSON_OUTPUT_FILE="$dir/report.json" \
    npm run test:e2e:demo -- --grep "$title" --workers=1 --trace=on --output="$dir/artifacts" 2>&1 | tee "$dir/run.log"
  local rc=${PIPESTATUS[0]}
  set -e

  # Specs write screenshots to test-results/ root; keep the ones this run produced next to its report.
  find "$ROOT/test-results" -maxdepth 1 -name '*.png' -newer "$dir/.started" -exec cp {} "$dir/" \; 2>/dev/null || true
  rm -f "$dir/.started"

  echo "evidence: $dir"
  node --input-type=module -e 'import { readFileSync } from "node:fs"; const r = JSON.parse(readFileSync(process.argv[1], "utf8")); const s = r.stats; console.log(`stats: expected=${s.expected} unexpected=${s.unexpected} skipped=${s.skipped} flaky=${s.flaky}`);' "$dir/report.json" 2>/dev/null || echo "stats: no report.json written"
  exit "$rc"
}

stop() {
  if [[ ! -f "$PIDFILE" ]]; then
    echo "nothing to stop: no pidfile from this helper"
    return 0
  fi
  local pid pgid
  pid="$(cat "$PIDFILE")"
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  if [[ -z "$pgid" ]]; then
    echo "pid $pid already gone"
  elif [[ "$pgid" == "$pid" ]]; then
    # launch used setsid, so this group holds only the dev server and its children.
    kill -TERM -- "-$pid" 2>/dev/null || true
  else
    echo "pid $pid is not a process-group leader (pgid $pgid); signalling pid only" >&2
    kill -TERM "$pid" 2>/dev/null || true
  fi
  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  rm -f "$PIDFILE" "$DEVLOG"
  echo "stopped dev server pid $pid; evidence under $EVIDENCE kept"
}

case "${1:-}" in
  launch) launch ;;
  doctor) doctor ;;
  prove) prove "${2:-}" "${3:-}" ;;
  stop) stop ;;
  *) usage ;;
esac
