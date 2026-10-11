#!/bin/sh
# Regenerates src/server/bsc/mirror-abi.ts from the Foundry build output.
set -e
cd "$(dirname "$0")/../contracts" && forge build >/dev/null
cd .. && python3 - <<'PY'
import json
abi=json.load(open("contracts/out/TailcoatMirror.sol/TailcoatMirror.json"))["abi"]
open("src/server/bsc/mirror-abi.ts","w").write("/** TailcoatMirror ABI, generated from contracts/out by scripts/abi.sh. Do not edit. */\nexport const mirrorAbi = "+json.dumps(abi,indent=2)+" as const\n")
PY
