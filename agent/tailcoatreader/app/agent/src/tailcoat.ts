/**
 * Tailcoat Reader's work: hand back a parsed public filing. A buyer asks for a House DocID, an
 * EDGAR accession number, or a person's slug (for their latest filing). The answer is the JSON
 * Tailcoat's own worker produced (document hash, receipt transaction, every trade with its
 * tokenized wrapper on BSC). Nothing here calls a model: the reading already happened and was
 * receipted on-chain, so the agent sells a fact, not an opinion.
 */
const API = (process.env.TAILCOAT_URL || "https://tailcoat.adilhusain.xyz").replace(/\/$/, "")

const DOC_ID = /\b(\d{7,8}|\d{10}-\d{2}-\d{6})\b/
const SLUG = /\b([a-z]+(?:-[a-z]+){1,4})\b/

async function get(path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error(`Tailcoat ${res.status} for ${path}`)
  return res.json()
}

/** Returns the filing JSON as a string when the prompt names one, or null to let the model answer. */
export async function filingWork(prompt: string): Promise<string | null> {
  const doc = prompt.match(DOC_ID)?.[1]
  if (doc) return JSON.stringify(await get(`/api/filing/${encodeURIComponent(doc)}`), null, 2)
  const slug = prompt.match(SLUG)?.[1]
  if (slug && /latest|filing|filings|trades|bought|sold|disclos/i.test(prompt)) {
    const profile = (await get(`/api/source/${encodeURIComponent(slug)}`)) as { source: unknown; filings: unknown[] }
    return JSON.stringify({ source: profile.source, latest: profile.filings.slice(0, 3) }, null, 2)
  }
  return null
}
