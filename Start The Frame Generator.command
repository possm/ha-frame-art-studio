#!/bin/zsh
set -eu
cd -- "${0:A:h}"
url=http://127.0.0.1:8765/
if curl -fsS "${url}api/ready" 2>/dev/null | grep -q 'The Frame Generator'; then
  open "$url"
  exit
fi

runtime=.frame-runtime/venv/bin/python
if [[ ! -x "$runtime" ]]; then
  runtime=python3
fi
"$runtime" server.py &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
  if curl -fsS "${url}api/ready" 2>/dev/null | grep -q 'The Frame Generator'; then
    open "$url"
    wait "$server_pid"
    exit
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo 'Sluit de vorige lokale server en start de editor opnieuw.'
    exit 1
  fi
  sleep 0.2
done
echo 'De lokale editor reageert niet.'
exit 1
