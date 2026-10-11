import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"

/** A local file by default; a Turso `libsql://` URL with DATABASE_AUTH_TOKEN on Vercel. */
const url = process.env.DATABASE_URL || `file:${process.cwd()}/data/tailcoat.db`
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined

const globalForDb = globalThis as unknown as { tailcoatDb?: ReturnType<typeof drizzle<typeof schema>> }

/** One connection per process; Next dev reloads modules, so cache it on globalThis. */
export const db = globalForDb.tailcoatDb ?? drizzle(createClient({ url, authToken }), { schema })
globalForDb.tailcoatDb = db

export { schema }
