import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

/** A person whose disclosed trades can be followed: a House member or a company insider. */
export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  kind: text("kind", { enum: ["house", "insider"] }).notNull(),
  name: text("name").notNull(),
  /** House: "CA11" style state-district. Insider: issuer ticker. */
  seat: text("seat"),
  /** House: D / R / I. Insider: officer title, e.g. "CEO". */
  affiliation: text("affiliation"),
  photoUrl: text("photo_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

/** One public document: a House PTR PDF or an EDGAR Form 4. */
export const filings = sqliteTable(
  "filings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    kind: text("kind", { enum: ["house_ptr", "form4"] }).notNull(),
    /** House DocID or EDGAR accession number. */
    docId: text("doc_id").notNull(),
    url: text("url").notNull(),
    /** sha256 of the exact bytes the agent read. */
    sha256: text("sha256"),
    filedAt: integer("filed_at", { mode: "timestamp" }).notNull(),
    status: text("status", { enum: ["new", "parsed", "receipted", "failed"] })
      .notNull()
      .default("new"),
    /** How the document was read: the model name for PDFs, "xml" for Form 4. */
    readBy: text("read_by"),
    /** BSC transaction that emitted the Receipt event for this filing. */
    receiptTx: text("receipt_tx"),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("filings_kind_doc").on(t.kind, t.docId), index("filings_filed_at").on(t.filedAt)],
)

/** One transaction line inside a filing. */
export const trades = sqliteTable(
  "trades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    filingId: integer("filing_id")
      .notNull()
      .references(() => filings.id),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    ticker: text("ticker"),
    assetName: text("asset_name").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    /** Disclosed USD range; Form 4 has an exact value so low == high. */
    amountLow: real("amount_low"),
    amountHigh: real("amount_high"),
    tradedAt: integer("traded_at", { mode: "timestamp" }).notNull(),
    disclosedAt: integer("disclosed_at", { mode: "timestamp" }).notNull(),
    /** Tokenized-stock symbol this trade mirrors into, e.g. "NVDAB". Null when not tokenized. */
    tokenSymbol: text("token_symbol"),
    /** Underlying close on the trade date and at disclosure. */
    pxTraded: real("px_traded"),
    pxDisclosed: real("px_disclosed"),
    mirrorStatus: text("mirror_status", { enum: ["pending", "done", "skipped"] })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("trades_source").on(t.sourceId), index("trades_disclosed").on(t.disclosedAt)],
)

/** A wallet following a source. The approval and caps live on-chain; this row records the choice. */
export const follows = sqliteTable(
  "follows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** EVM address, lowercase. */
    wallet: text("wallet").notNull(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    /** Cash spent per mirrored buy, in USD. */
    perTradeUsd: real("per_trade_usd").notNull(),
    autoSell: integer("auto_sell", { mode: "boolean" }).notNull().default(true),
    /** Sell when the price falls this fraction below the position's peak. Null = off. */
    trailingStopPct: real("trailing_stop_pct").default(0.15),
    /** Sell when a position has been held this many days without a disclosed sale. Null = off. */
    maxHoldDays: integer("max_hold_days").default(90),
    /** A /demo run's follow: driven by the demo engine, never by the worker. */
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** The approve or setLimits transaction the follower signed. */
    approveTx: text("approve_tx"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("follows_wallet_source").on(t.wallet, t.sourceId)],
)

/** One mirror attempt for one follower, including the ones that were refused and why. */
export const executions = sqliteTable(
  "executions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tradeId: integer("trade_id")
      .notNull()
      .references(() => trades.id),
    followId: integer("follow_id")
      .notNull()
      .references(() => follows.id),
    wallet: text("wallet").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    tokenSymbol: text("token_symbol").notNull(),
    cashAmount: real("cash_amount"),
    tokenAmount: real("token_amount"),
    /** Reference price per share used for the guard. */
    refPx: real("ref_px"),
    /** Price per share the route implied, and the one the chain settled at. */
    quotePx: real("quote_px"),
    fillPx: real("fill_px"),
    /** Which route built the swap: "binance:LiquidMesh", "pancake:v3:2500". */
    route: text("route"),
    /** Who vouched for the transaction before broadcast: "binance" (Transaction API) or "rpc". */
    simulatedBy: text("simulated_by"),
    txHash: text("tx_hash"),
    status: text("status", { enum: ["sent", "confirmed", "rejected", "failed"] }).notNull(),
    reason: text("reason"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("executions_trade_follow_side").on(t.tradeId, t.followId, t.side),
    index("executions_wallet").on(t.wallet),
  ],
)

export type Source = typeof sources.$inferSelect
export type Filing = typeof filings.$inferSelect
export type Trade = typeof trades.$inferSelect
export type Follow = typeof follows.$inferSelect
export type Execution = typeof executions.$inferSelect

/** Small key-value store for deployment facts and caches. */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

/** A follower's holding of one stock bought by mirroring one person. Exit rules act on these. */
export const positions = sqliteTable(
  "positions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    wallet: text("wallet").notNull(),
    followId: integer("follow_id")
      .notNull()
      .references(() => follows.id),
    /** The trade that opened the position. */
    tradeId: integer("trade_id")
      .notNull()
      .references(() => trades.id),
    tokenSymbol: text("token_symbol").notNull(),
    ticker: text("ticker").notNull(),
    tokens: real("tokens").notNull(),
    costUsd: real("cost_usd").notNull(),
    entryPx: real("entry_px").notNull(),
    peakPx: real("peak_px").notNull(),
    lastPx: real("last_px"),
    openedAt: integer("opened_at", { mode: "timestamp" }).notNull(),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    /** Set when an exit rule fired but the follower has not allowed Tailcoat to sell. */
    exitDue: text("exit_due"),
    closedAt: integer("closed_at", { mode: "timestamp" }),
    closeReason: text("close_reason", { enum: ["member_sold", "trailing_stop", "max_hold", "manual"] }),
    closePx: real("close_px"),
    closeTx: text("close_tx"),
  },
  (t) => [index("positions_wallet").on(t.wallet), index("positions_open").on(t.status)],
)

export type Position = typeof positions.$inferSelect

/** One run of one worker job. Every tick leaves a row, so silence is visible. */
export const runs = sqliteTable(
  "runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    job: text("job").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    ok: integer("ok", { mode: "boolean" }),
    /** What the run did, e.g. {"filings":3,"mirrors":1}. */
    summary: text("summary"),
    error: text("error"),
  },
  (t) => [index("runs_job_started").on(t.job, t.startedAt)],
)

/** A failure kept with its input so it can be reviewed and retried: model calls, API calls, sends. */
export const incidents = sqliteTable(
  "incidents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Where it happened: "binance:quote", "reader", "executor:broadcast". */
    area: text("area").notNull(),
    input: text("input"),
    error: text("error").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (t) => [index("incidents_area").on(t.area, t.createdAt)],
)

export type Run = typeof runs.$inferSelect
export type Incident = typeof incidents.$inferSelect
