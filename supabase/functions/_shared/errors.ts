// External error reporting for edge functions.
//
// Default Supabase edge-function logs are ephemeral and not aggregated, so a
// QPay/Twilio/Expo failure is invisible until a user complains. This module
// fire-and-forgets a JSON payload to a webhook URL configured via env var,
// giving us a real alerting surface without adding an SDK dependency.
//
// Supported webhook targets (auto-detected from the URL):
//
//   * Sentry minidump endpoint — set `SENTRY_DSN` (full DSN).
//     We post a tiny "store" envelope; works for any Sentry project.
//
//   * Slack incoming webhook — set `ERROR_WEBHOOK_URL=https://hooks.slack.com/...`
//     Posts a plain-text message with code blocks for the error.
//
//   * Discord webhook — set `ERROR_WEBHOOK_URL=https://discord.com/api/webhooks/...`
//     Same format as Slack; both accept the same payload shape via "text".
//
//   * Generic JSON webhook — any other ERROR_WEBHOOK_URL.
//     Posts `{ source, level, message, context, timestamp }` as JSON.
//
// All paths are fire-and-forget with a 3-second timeout — a reporting failure
// must never cascade to the caller. If no env var is set, every helper here
// is a silent no-op (so dev and CI work without configuration).

const SENTRY_DSN        = Deno.env.get('SENTRY_DSN')         ?? ''
const ERROR_WEBHOOK_URL = Deno.env.get('ERROR_WEBHOOK_URL')  ?? ''
const ENV_LABEL         = Deno.env.get('DEPLOY_ENV')         ?? 'production'

export type LogLevel = 'error' | 'warning' | 'info'

export interface ErrorContext {
  /** Edge function name, e.g. 'payment-webhook' */
  source: string
  /** Optional structured context — booking id, payment id, etc. */
  context?: Record<string, unknown>
  /** Defaults to 'error'. Use 'warning' for recoverable issues you still want to see. */
  level?: LogLevel
}

/**
 * Report an error to the configured external sink. Never throws. Never blocks
 * for more than ~3 seconds. Safe to call from any try/catch in any edge fn.
 *
 *   try {
 *     await doRiskyThing()
 *   } catch (e) {
 *     reportError(e, { source: 'payment-webhook', context: { paymentId } })
 *     // ...still return your response
 *   }
 */
export function reportError(
  err: unknown,
  ctx: ErrorContext,
): void {
  // Always console.error so Supabase's built-in log stream still has it.
  // This is the durable path; external sinks are best-effort augmentation.
  console.error(`[${ctx.source}]`, err, ctx.context ?? {})

  if (!SENTRY_DSN && !ERROR_WEBHOOK_URL) return

  const message  = err instanceof Error ? err.message : String(err)
  const stack    = err instanceof Error ? err.stack   : undefined
  const level    = ctx.level ?? 'error'
  const ctrl     = new AbortController()
  const timeout  = setTimeout(() => ctrl.abort(), 3000)

  // Fire-and-forget — never await this in the request handler. A void promise
  // with a catch means a rejected promise won't trigger UnhandledPromiseRejection.
  ;(async () => {
    try {
      if (SENTRY_DSN) {
        await postToSentry(SENTRY_DSN, ctx.source, message, stack, level, ctx.context, ctrl.signal)
      } else if (ERROR_WEBHOOK_URL) {
        await postToWebhook(ERROR_WEBHOOK_URL, ctx.source, message, stack, level, ctx.context, ctrl.signal)
      }
    } catch (e) {
      // Reporting failed — log and move on. We don't want a recursive loop.
      console.warn('reportError sink failed:', e)
    } finally {
      clearTimeout(timeout)
    }
  })()
}

/** Convenience wrapper for the common "log a warning, keep going" case. */
export function reportWarning(err: unknown, ctx: Omit<ErrorContext, 'level'>): void {
  reportError(err, { ...ctx, level: 'warning' })
}

/**
 * Top-level handler wrapper. Use this in `Deno.serve(...)` to automatically
 * catch any throw and report it before returning a generic 500. Eliminates
 * per-function boilerplate.
 *
 *   Deno.serve(withErrorReporting('payment-webhook', async (req) => {
 *     // ... your handler
 *   }))
 */
export function withErrorReporting(
  source: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req)
    } catch (err) {
      reportError(err, {
        source,
        context: { method: req.method, url: req.url },
      })
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }
}

// ── Sinks ─────────────────────────────────────────────────────────────────────

async function postToSentry(
  dsn:     string,
  source:  string,
  message: string,
  stack:   string | undefined,
  level:   LogLevel,
  context: Record<string, unknown> | undefined,
  signal:  AbortSignal,
): Promise<void> {
  // Parse the DSN: https://<public_key>@<host>/<project_id>
  const parsed = new URL(dsn)
  const publicKey  = parsed.username
  const projectId  = parsed.pathname.replace(/^\//, '')
  const endpoint   = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    logger: source,
    level,
    platform: 'javascript',
    environment: ENV_LABEL,
    tags: { source, deploy_env: ENV_LABEL },
    extra: context ?? {},
    message: { formatted: message },
    exception: stack ? { values: [{ type: 'Error', value: message, stacktrace: { frames: parseStack(stack) } }] } : undefined,
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=monmap-edge/1.0`,
    },
    body: JSON.stringify(event),
  })
  if (!res.ok) {
    throw new Error(`sentry ${res.status}: ${await res.text().catch(() => '')}`)
  }
}

async function postToWebhook(
  url:     string,
  source:  string,
  message: string,
  stack:   string | undefined,
  level:   LogLevel,
  context: Record<string, unknown> | undefined,
  signal:  AbortSignal,
): Promise<void> {
  const isSlack   = /hooks\.slack\.com\//i.test(url)
  const isDiscord = /discord\.com\/api\/webhooks\//i.test(url)

  let body: string

  if (isSlack || isDiscord) {
    const icon = level === 'error' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️'
    const lines = [
      `${icon} *MonMap [${ENV_LABEL}] ${source}*`,
      '```',
      message,
      ...(stack ? ['', stack.split('\n').slice(0, 8).join('\n')] : []),
      ...(context && Object.keys(context).length
        ? ['', 'context: ' + JSON.stringify(context)]
        : []),
      '```',
    ]
    // Slack uses { text }, Discord accepts { content } — both honour { text }
    // via a compatibility quirk for incoming webhooks, but use the canonical
    // field for each to be safe.
    body = JSON.stringify(
      isDiscord ? { content: lines.join('\n') } : { text: lines.join('\n') },
    )
  } else {
    body = JSON.stringify({
      source,
      level,
      message,
      stack,
      context: context ?? {},
      timestamp: new Date().toISOString(),
      env: ENV_LABEL,
    })
  }

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (!res.ok) {
    throw new Error(`webhook ${res.status}: ${await res.text().catch(() => '')}`)
  }
}

// Minimal stack parser for Sentry — turns "at fn (file:line:col)" lines into
// the frames Sentry expects. Best-effort; falls back to whole string if parse
// fails. We only need this for Sentry, since Slack/Discord get the raw stack.
function parseStack(stack: string): Array<{ function: string; filename: string; lineno: number; colno: number }> {
  return stack.split('\n').slice(1).map(line => {
    const m = line.trim().match(/^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/)
              || line.trim().match(/^at\s+(.+?):(\d+):(\d+)$/)
    if (!m) return { function: '?', filename: line.trim(), lineno: 0, colno: 0 }
    if (m.length === 5) return { function: m[1], filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) }
    return { function: '?', filename: m[1], lineno: Number(m[2]), colno: Number(m[3]) }
  }).filter(f => f.lineno > 0).reverse() // Sentry expects oldest-first
}
