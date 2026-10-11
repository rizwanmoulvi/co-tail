import { NextResponse } from "next/server"
import { isAddress } from "viem"

export function ok(data: unknown) {
  return NextResponse.json(data)
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

/** Runs a handler and turns thrown errors into a JSON error with a readable message. */
export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn()
  } catch (err) {
    console.error(err)
    return fail(err instanceof Error ? err.message : "Something went wrong", 500)
  }
}

/** An EVM address. Wallets are stored lowercase so lookups never depend on checksum casing. */
export function isWallet(value: unknown): value is string {
  return typeof value === "string" && isAddress(value, { strict: false })
}
