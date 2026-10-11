/**
 * Run records and incidents. Every worker job leaves a row per tick; every failure that matters
 * (a model call, a Binance API call, a broadcast) is kept with its input so it can be reviewed.
 */
import { desc, eq, gt, and, isNull } from "drizzle-orm"
import { db, schema } from "./db"

export async function recordRun<T extends Record<string, number | string | boolean>>(job: string, fn: () => Promise<T | void>) {
  const startedAt = new Date()
  const [row] = await db.insert(schema.runs).values({ job, startedAt }).returning({ id: schema.runs.id })
  try {
    const summary = await fn()
    await db
      .update(schema.runs)
      .set({ finishedAt: new Date(), ok: true, summary: summary ? JSON.stringify(summary) : null })
      .where(eq(schema.runs.id, row.id))
    return summary
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.update(schema.runs).set({ finishedAt: new Date(), ok: false, error: message.slice(0, 1000) }).where(eq(schema.runs.id, row.id))
    throw err
  }
}

export async function incident(area: string, input: unknown, err: unknown) {
  const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  await db.insert(schema.incidents).values({
    area,
    input: input === undefined ? null : JSON.stringify(input, (_, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 4000),
    error: error.slice(0, 2000),
    createdAt: new Date(),
  })
  return error
}

/** What a health check reads: the last run per job, and failures nobody has looked at. */
export async function health() {
  // How long each job may go quiet before it counts as stale: the registry refreshes hourly.
  const jobs: { job: string; maxQuietMs: number }[] = [
    { job: "ingest", maxQuietMs: 10 * 60_000 },
    { job: "trade", maxQuietMs: 10 * 60_000 },
    { job: "registry", maxQuietMs: 2 * 3600_000 },
  ]
  const last = await Promise.all(
    jobs.map(async ({ job, maxQuietMs }) => {
      const r = await db.query.runs.findFirst({ where: eq(schema.runs.job, job), orderBy: desc(schema.runs.startedAt) })
      return { job, maxQuietMs, startedAt: r?.startedAt ?? null, ok: r?.ok ?? null, error: r?.error ?? null, summary: r?.summary ?? null }
    }),
  )
  const since = new Date(Date.now() - 24 * 3600_000)
  const open = await db.$count(schema.incidents, and(gt(schema.incidents.createdAt, since), isNull(schema.incidents.resolvedAt)))
  const stale = last.filter((l) => !l.startedAt || Date.now() - l.startedAt.getTime() > l.maxQuietMs).map((l) => l.job)
  return { ok: stale.length === 0, stale, openIncidents24h: open, jobs: last }
}
