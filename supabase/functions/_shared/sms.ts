// Shared SMS helpers for MonMap edge functions.
//
// Twilio supports alphanumeric sender IDs (e.g. "MONMAP") to most countries
// outside the US/Canada.  Mongolia is on the supported list, so we deliver
// owner & guest notifications under the brand name "MONMAP" — far better
// open rates than a +1 US Twilio number which Mongolian carriers flag as
// foreign spam.
//
// For destinations Twilio cannot deliver alphanumerics to (e.g. US/Canada,
// for guests with foreign numbers), we fall back to the regular E.164
// phone-number sender.
//
// Required env vars:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_SENDER_ID    — alphanumeric, e.g. "MONMAP" (max 11 chars)
//   TWILIO_FROM_NUMBER  — E.164 phone, fallback for non-supported destinations

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_SENDER_ID   = Deno.env.get('TWILIO_SENDER_ID')   ?? 'MONMAP'
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER') ?? ''

/**
 * Normalize a phone number to E.164.
 *
 *   "+97694142121"   →  "+97694142121"   (already E.164)
 *   "97694142121"    →  "+97694142121"   (missing leading +)
 *   "94142121"       →  "+97694142121"   (8-digit Mongolian local format)
 *   "8800-1234"      →  "+97688001234"   (separators stripped)
 *
 * Anything that doesn't fit a Mongolian shape is returned cleaned but
 * untouched, on the assumption it's a properly-formatted foreign number.
 */
export function normalizeMnPhone(p: string): string {
  const cleaned = p.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('976')) return '+' + cleaned
  // Mongolian mobile prefixes: 8x and 9x, total 8 digits.
  if (/^[89]\d{7}$/.test(cleaned)) return '+976' + cleaned
  return cleaned
}

/**
 * Pick the best Twilio sender for a destination phone.
 *
 *   +976xxx      →  TWILIO_SENDER_ID  (alphanumeric "MONMAP")
 *   anything else →  TWILIO_FROM_NUMBER (E.164 fallback)
 *
 * If the alphanumeric sender isn't configured, falls back to the phone number.
 * If neither is configured, returns the empty string and the SMS will fail
 * loudly at the Twilio API call.
 */
export function pickSender(toPhone: string): string {
  const isMongolian = toPhone.startsWith('+976')
  if (isMongolian && TWILIO_SENDER_ID) return TWILIO_SENDER_ID
  return TWILIO_FROM_NUMBER || TWILIO_SENDER_ID
}

/**
 * Send an SMS via Twilio.  Picks the right sender automatically and
 * normalizes the destination phone to E.164 first.  Errors are logged but
 * never thrown — callers don't have to wrap in try/catch.
 */
export async function sendSMS(to: string, body: string): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('sendSMS: Twilio credentials missing — skipping send')
    return
  }
  const normalizedTo = normalizeMnPhone(to)
  const from = pickSender(normalizedTo)
  if (!from) {
    console.warn(`sendSMS: no sender configured for ${normalizedTo} — skipping`)
    return
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: normalizedTo, From: from, Body: body }).toString(),
  })
  if (!res.ok) {
    const txt = await res.text()
    console.error(`Twilio error sending to ${normalizedTo} from ${from}:`, txt)
  }
}
