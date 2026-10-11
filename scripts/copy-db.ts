/**
 * Copies every table from the shipped SQLite file into a remote libSQL (Turso) database, ids and
 * all, so the Vercel site and the Render worker start from the filings already read.
 *   DATABASE_URL=libsql://<db>.turso.io DATABASE_AUTH_TOKEN=... npx tsx scripts/copy-db.ts [data/tailcoat.db]
 * Run `npx drizzle-kit push` against the remote first so the tables exist. Rows that already exist
 * are left alone, so running it twice is safe.
 */
import { createClient } from "@libsql/client"

const from = createClient({ url: `file:${process.argv[2] ?? "data/tailcoat.db"}` })
const url = process.env.DATABASE_URL
if (!url || url.startsWith("file:")) throw new Error("DATABASE_URL must be the remote libsql:// database")
const to = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN })

// Parents before children, because of the foreign keys.
const TABLES = ["sources", "filings", "trades", "follows", "executions", "positions", "kv", "runs", "incidents"]

for (const table of TABLES) {
  const rows = (await from.execute(`select * from ${table}`)).rows
  if (!rows.length) {
    console.log(`${table}: nothing to copy`)
    continue
  }
  const cols = Object.keys(rows[0])
  const sql = `insert or ignore into ${table} (${cols.join(",")}) values (${cols.map(() => "?").join(",")})`
  let n = 0
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200).map((r) => ({ sql, args: cols.map((c) => (r[c] === undefined ? null : (r[c] as string | number | null))) }))
    await to.batch(batch, "write")
    n += batch.length
  }
  console.log(`${table}: ${n} rows copied`)
}
console.log("done")
