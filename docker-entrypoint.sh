#!/bin/sh
set -e

# Patch config.json so sigma-server talks to the AI container by its service name.
# Set AI_SERVER_URL in the environment (docker-compose does this automatically).
if [ -n "${AI_SERVER_URL:-}" ]; then
    python3 - <<'EOF'
import json, os
from pathlib import Path
cfg = Path("/app/config.json")
data = json.loads(cfg.read_text()) if cfg.exists() else {}
data.setdefault("ai", {})["server"] = os.environ["AI_SERVER_URL"]
cfg.write_text(json.dumps(data, indent=2))
print(f"[entrypoint] ai.server => {os.environ['AI_SERVER_URL']}")
EOF
fi

exec "$@"
