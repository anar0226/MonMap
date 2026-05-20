// QPay Merchant API v2 helper
// Docs: https://developer.qpay.mn
// Auth: Basic auth (client_id:client_secret) to get a Bearer token, then Bearer on all requests.

const QPAY_BASE_URL     = 'https://merchant.qpay.mn/v2'
const QPAY_CLIENT_ID    = Deno.env.get('QPAY_CLIENT_ID')!
const QPAY_CLIENT_SECRET = Deno.env.get('QPAY_CLIENT_SECRET')!
const QPAY_INVOICE_CODE = Deno.env.get('QPAY_INVOICE_CODE')!

export interface QPayBankLink {
  name: string
  description: string
  logo: string
  link: string
}

export interface QPayInvoiceResult {
  invoiceId: string
  qrImage: string       // base64 PNG
  urls: QPayBankLink[]
}

export interface QPayPaymentCheck {
  invoiceId: string
  status: 'PAID' | 'UNPAID' | 'CANCELLED' | 'FAILED'
  paidAmount?: number
  paymentId?: string    // QPay's internal payment ID (needed for refunds)
}

// Fetch a short-lived Bearer token using client credentials.
// QPay tokens expire in ~2 hours. Edge functions re-fetch on each cold start;
// warm instances reuse the module-level cached token.
let _cachedToken: { token: string; expiresAt: number } | null = null

export async function getQPayToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt) {
    return _cachedToken.token
  }
  const basic = btoa(`${QPAY_CLIENT_ID}:${QPAY_CLIENT_SECRET}`)
  const res = await fetch(`${QPAY_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
  })
  if (!res.ok) {
    throw new Error(`QPay auth failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json()
  const token: string = json.access_token
  const expiresIn: number = json.expires_in ?? 7200
  _cachedToken = { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 }
  return token
}

// Create a QPay invoice and return the QR image + bank deep-links.
export async function createQPayInvoice(opts: {
  senderInvoiceNo: string   // our payments.id — returned verbatim in the webhook
  description: string
  amount: number            // MNT integer
  callbackUrl: string
}): Promise<QPayInvoiceResult> {
  const token = await getQPayToken()
  const res = await fetch(`${QPAY_BASE_URL}/invoice`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      invoice_code: QPAY_INVOICE_CODE,
      sender_invoice_no: opts.senderInvoiceNo,
      invoice_receiver_code: 'terminal',
      invoice_description: opts.description,
      amount: opts.amount,
      callback_url: opts.callbackUrl,
    }),
  })
  if (!res.ok) {
    throw new Error(`QPay invoice creation failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json()
  return {
    invoiceId: json.invoice_id,
    qrImage: json.qr_image,   // base64 PNG
    urls: json.urls ?? [],
  }
}

// Verify a payment by calling QPay — used to confirm authenticity before
// converting a payment into a booking.
//
// QPay v2 spec: POST /v2/payment/check with JSON body
//   { object_type: "INVOICE", object_id: <invoice_id>, offset: { page_number, page_limit } }
// Response: { count, paid_amount, rows: [{ payment_id, payment_status, payment_amount, ... }] }
export async function checkQPayInvoice(invoiceId: string): Promise<QPayPaymentCheck> {
  const token = await getQPayToken()
  const res = await fetch(`${QPAY_BASE_URL}/payment/check`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      object_type: 'INVOICE',
      object_id:   invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    console.warn(`QPay check failed: ${res.status} ${errText}`)
    throw new Error(`QPay check failed: ${res.status} ${errText}`)
  }
  const json = await res.json()
  const rows: Array<{ payment_status?: string; payment_amount?: number; paid_amount?: number; payment_id?: string }> =
    json.rows ?? []
  const paidRow = rows.find(r => r.payment_status === 'PAID')
  if (paidRow) {
    return {
      invoiceId,
      status:     'PAID',
      paidAmount: paidRow.payment_amount ?? paidRow.paid_amount,
      paymentId:  paidRow.payment_id,
    }
  }
  console.log(`QPay check: invoice ${invoiceId} not paid yet (rows=${rows.length}, count=${json.count ?? 0})`)
  return { invoiceId, status: 'UNPAID' }
}

// Fetch a single QPay payment by its internal payment ID.
// Used when QPay's webhook gives us only qpay_payment_id (not invoice_id).
export async function getQPayPaymentById(qpayPaymentId: string): Promise<{
  paymentId: string
  invoiceId: string | null
  senderInvoiceNo: string | null
  status: 'PAID' | 'UNPAID' | 'CANCELLED' | 'FAILED' | string
  paidAmount?: number
  raw: unknown
}> {
  const token = await getQPayToken()
  const res = await fetch(`${QPAY_BASE_URL}/payment/${encodeURIComponent(qpayPaymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`QPay payment lookup failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json()
  return {
    paymentId:       json.payment_id ?? qpayPaymentId,
    invoiceId:       json.object_id ?? json.invoice_id ?? null,
    senderInvoiceNo: json.sender_invoice_no ?? null,
    status:          json.payment_status ?? 'UNKNOWN',
    paidAmount:      json.payment_amount,
    raw:             json,
  }
}

// Issue a refund for a previously paid QPay payment.
export async function refundQPayPayment(opts: {
  qpayPaymentId: string
  amount: number
  note: string
}): Promise<void> {
  const token = await getQPayToken()
  const res = await fetch(`${QPAY_BASE_URL}/payment/${opts.qpayPaymentId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: opts.amount, note: opts.note }),
  })
  if (!res.ok) {
    throw new Error(`QPay refund failed: ${res.status} ${await res.text()}`)
  }
}
