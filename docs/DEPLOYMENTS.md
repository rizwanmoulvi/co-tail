# Deployments

| What | Where | Address or URL |
|---|---|---|
| TailcoatMirror | BSC mainnet (56) | pending: deployed by `scripts/deploy.sh` once the operator key is funded |
| Operator key | signs receipts and mirrors; can only call the contract | `0xDAe725EF7e04F290974468A471b0375aD1A6D8b1` |
| Agent wallet (Tailcoat Reader) | ERC-8004 identity, ERC-8183 seller | `0xd26b4Bc2325ee796c200b89ce92B2480Eb7FD1de` |
| Site | Vercel (`sin1`), or the VPS behind Caddy | the Vercel URL, or https://tailcoat.adilhusain.xyz |
| Worker | Render or Railway (Singapore) `tailcoat-worker`, or the VPS | no URL; its runs show on `/api/health` |
| Agent | Render or Railway (Singapore) `tailcoat-agent`, or the VPS | the Render URL, or https://agent.tailcoat.adilhusain.xyz |
| Database | Turso when hosted, `data/tailcoat.db` on one box | |

Allowlisted routers on the contract: PancakeSwap V3 SwapRouter `0x1b81D678ffb9C0263b24A97847620C99d213eB14`,
plus the Binance aggregator router and spender addresses observed from the Trading API's `/swap`
response once a key is active (recorded here when added).
