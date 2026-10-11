#!/bin/sh
# Deploys TailcoatMirror with the operator key as both operator and owner, allowlists the
# PancakeSwap V3 router and every executable stock in the registry cache, and prints the address.
#   RPC=https://bsc-dataseed.binance.org ./scripts/deploy.sh
#   RPC=http://127.0.0.1:8547 ./scripts/deploy.sh         (local Anvil fork)
set -e
cd "$(dirname "$0")/.."
RPC="${RPC:-https://bsc-dataseed.binance.org}"
KEY=$(python3 -c "import json;d=json.load(open('${OPERATOR_KEYFILE:-keys/operator.json}'));print((d[0] if isinstance(d,list) else d)['private_key'])")
ADDR=$(python3 -c "import json;d=json.load(open('${OPERATOR_KEYFILE:-keys/operator.json}'));print((d[0] if isinstance(d,list) else d)['address'])")
STOCKS=$(python3 -c "import json;r=json.load(open('data/registry.json'));print(','.join(t['address'] for t in r['tokens'].values() if t['executable']))" 2>/dev/null || true)
cd contracts
CASH="${CASH:-0x55d398326f99059fF775485246999027B3197955}" OPERATOR="$ADDR" OWNER="${OWNER:-$ADDR}" \
ROUTERS="${ROUTERS:-0x1b81D678ffb9C0263b24A97847620C99d213eB14}" STOCKS="${STOCKS:-}" \
forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key "$KEY" ${LEGACY:+--legacy} 2>&1 | grep -E "TailcoatMirror|Error|error" || true
