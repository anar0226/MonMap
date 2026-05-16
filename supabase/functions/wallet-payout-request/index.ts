// wallet-payout-request
// V1 STUB. Once a user crosses the 50,000 MNT withdrawal threshold AND has
// kyc_verified = true, this endpoint receives the payout request, debits the
// wallet to a 'pending' payout ledger row, and queues the bank transfer.
//
// For v1 we only validate the eligibility checks and persist a payout intent.
// The actual bank-side integration (QPay payout or manual ops review) is
// deferred — the response surfaces a status the client can show in the wallet
// UI ("Submitted — under review").
//
// Body: { amountMnt, bankAccount: { bank, accountNumber, accountName } }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authUserId, jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MIN_WITHDRAW_MNT = 50_000

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
  try {
    const userId = await authUserId(req, SUPABASE_URL, SUPABASE_ANON_KEY)
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401)

    const { amountMnt, bankAccount } = await req.json()
    const amount = Number(amountMnt)
    if (!Number.isInteger(amount) || amount < MIN_WITHDRAW_MNT) {
      return jsonResponse({ error: 'amount_below_threshold', minimum: MIN_WITHDRAW_MNT }, 400)
    }
    if (!bankAccount?.bank || !bankAccount?.accountNumber || !bankAccount?.accountName) {
      return jsonResponse({ error: 'missing_bank_account' }, 400)
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: wallet } = await db
      .from('wallet_balances')
      .select('available_mnt, kyc_verified')
      .eq('user_id', userId)
      .maybeSingle()

    if (!wallet) return jsonResponse({ error: 'no_wallet' }, 404)
    if (!wallet.kyc_verified) return jsonResponse({ error: 'kyc_required' }, 403)
    if (wallet.available_mnt < amount) return jsonResponse({ error: 'insufficient_balance' }, 400)

    // Debit immediately into a payout-pending ledger row. If ops reject the
    // payout, a manual 'reversal' ledger entry restores the credit.
    const { error: debitErr } = await db.rpc('debit_wallet', {
      p_user_id:   userId,
      p_max_delta: amount,
      p_kind:      'payout',
      p_ref_id:    crypto.randomUUID(),
      p_metadata:  { bank: bankAccount.bank, status: 'submitted' },
    })
    if (debitErr) {
      console.error('payout debit_wallet error', debitErr)
      return jsonResponse({ error: 'debit_failed' }, 500)
    }

    // v1: just acknowledge. Wire to ops queue / bank API in v2.
    return jsonResponse({
      status: 'submitted',
      reviewWindowHours: 72,
    })
  } catch (err) {
    console.error('wallet-payout-request error', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
