import { supabase, supabaseEnabled } from './supabaseClient'
import type { Plan } from './storage'
import { parseJson, STORAGE_KEYS } from './storage'

const REFERRAL_PREFIX = 'ELEA-'
const REFERRAL_PATTERN = /^ELEA-[A-Z0-9]{6,18}$/
const DEFAULT_DISCOUNT_PERCENT = 10

type ClaimRpcRow = {
  status?: string
  referrer_user_id?: string | null
  referral_code?: string | null
}

type ReserveRpcRow = {
  status?: string
  plan?: string
  list_amount_cents?: number
  discount_percent?: number
  discount_cents?: number
  final_amount_cents?: number
  referrer_credit_cents?: number
  referral_code?: string | null
  referrer_user_id?: string | null
}

export type ReferralClaimStatus =
  | 'no_pending'
  | 'claimed'
  | 'already_claimed'
  | 'invalid_code'
  | 'self_referral'
  | 'unauthenticated'
  | 'rpc_error'
  | 'unknown'

export type ReferralClaimResult = {
  status: ReferralClaimStatus
  code: string | null
  referrerUserId: string | null
  message?: string
}

type EligiblePlan = Extract<Plan, 'basic' | 'pro'>

export type ReferralReservationResult = {
  status: 'reserved' | 'no_referral' | 'plan_not_eligible' | 'invalid_amount' | 'unauthenticated' | 'rpc_error' | 'unknown'
  plan: EligiblePlan
  listAmountCents: number
  discountPercent: number
  discountCents: number
  finalAmountCents: number
  referrerCreditCents: number
  referralCode: string | null
  referrerUserId: string | null
  message?: string
}

const BASE_PLAN_CENTS: Record<EligiblePlan, number> = {
  basic: 59000,
  pro: 129000,
}

const randomChunk = () => Math.random().toString(36).slice(2, 8).toUpperCase()

const readLocalCode = (key: string) => {
  const value = parseJson<string | null>(localStorage.getItem(key), null)
  return normalizeReferralCode(value)
}

const writeLocalCode = (key: string, value: string | null) => {
  if (!value) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, JSON.stringify(value))
}

const buildDeterministicCode = (userId: string) => {
  const seed = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
  const core = seed.length >= 6 ? seed : `${seed}${randomChunk()}`.slice(0, 10)
  return `${REFERRAL_PREFIX}${core}`
}

export const normalizeReferralCode = (value: string | null | undefined) => {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (!REFERRAL_PATTERN.test(normalized)) return null
  return normalized
}

export const getPlanListAmountCents = (plan: EligiblePlan) => BASE_PLAN_CENTS[plan]

export const buildReferralShareLink = (code: string) => {
  const url = new URL('/auth', window.location.origin)
  url.searchParams.set('ref', code)
  return url.toString()
}

export const captureReferralCodeFromSearch = (search: string) => {
  const params = new URLSearchParams(search)
  const code = normalizeReferralCode(params.get('ref'))
  if (!code) return null
  writeLocalCode(STORAGE_KEYS.referralPendingCode, code)
  return code
}

export const getPendingReferralCode = () => readLocalCode(STORAGE_KEYS.referralPendingCode)

export const clearPendingReferralCode = () => {
  writeLocalCode(STORAGE_KEYS.referralPendingCode, null)
}

export const copyTextToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // fallback below
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

export const ensureOwnReferralCode = async (userId: string) => {
  const local = readLocalCode(STORAGE_KEYS.referralOwnCode)
  if (local) return local

  const fallbackCode = buildDeterministicCode(userId)

  if (!supabaseEnabled || !supabase) {
    writeLocalCode(STORAGE_KEYS.referralOwnCode, fallbackCode)
    return fallbackCode
  }

  const { data: existing, error: existingError } = await supabase
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle()

  if (!existingError && existing?.code) {
    const normalized = normalizeReferralCode(existing.code)
    if (normalized) {
      writeLocalCode(STORAGE_KEYS.referralOwnCode, normalized)
      return normalized
    }
  }

  let code = fallbackCode
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('referral_codes')
      .upsert(
        {
          user_id: userId,
          code,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('code')
      .maybeSingle()

    if (!error) {
      const normalized = normalizeReferralCode(data?.code ?? code)
      if (normalized) {
        writeLocalCode(STORAGE_KEYS.referralOwnCode, normalized)
        return normalized
      }
    }

    code = `${REFERRAL_PREFIX}${randomChunk()}${randomChunk().slice(0, 2)}`
  }

  writeLocalCode(STORAGE_KEYS.referralOwnCode, fallbackCode)
  return fallbackCode
}

export const claimPendingReferral = async (userId: string): Promise<ReferralClaimResult> => {
  const pending = getPendingReferralCode()
  if (!pending) {
    return { status: 'no_pending', code: null, referrerUserId: null }
  }

  const ownCode = await ensureOwnReferralCode(userId)
  if (pending === ownCode) {
    clearPendingReferralCode()
    return {
      status: 'self_referral',
      code: pending,
      referrerUserId: null,
      message: 'Eigener Referral-Code kann nicht verwendet werden.',
    }
  }

  if (!supabaseEnabled || !supabase) {
    writeLocalCode(STORAGE_KEYS.referralClaimedCode, pending)
    clearPendingReferralCode()
    return {
      status: 'claimed',
      code: pending,
      referrerUserId: null,
      message: 'Referral lokal verknüpft.',
    }
  }

  const { data, error } = await supabase.rpc('claim_referral', {
    input_code: pending,
    input_source: 'invite_link',
  })

  if (error) {
    return {
      status: 'rpc_error',
      code: pending,
      referrerUserId: null,
      message: error.message,
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as ClaimRpcRow | null
  const status = (row?.status ?? 'unknown') as ReferralClaimStatus
  const referrerUserId = row?.referrer_user_id ?? null
  const normalizedCode = normalizeReferralCode(row?.referral_code ?? pending) ?? pending

  if (status === 'claimed' || status === 'already_claimed') {
    writeLocalCode(STORAGE_KEYS.referralClaimedCode, normalizedCode)
    clearPendingReferralCode()
  } else if (status === 'invalid_code' || status === 'self_referral') {
    clearPendingReferralCode()
  }

  return {
    status,
    code: normalizedCode,
    referrerUserId,
    message: undefined,
  }
}

export const reserveReferralDiscount = async ({
  userId,
  plan,
  listAmountCents,
}: {
  userId: string
  plan: EligiblePlan
  listAmountCents?: number
}): Promise<ReferralReservationResult> => {
  const baseAmount = listAmountCents ?? getPlanListAmountCents(plan)

  if (!supabaseEnabled || !supabase) {
    return {
      status: 'no_referral',
      plan,
      listAmountCents: baseAmount,
      discountPercent: DEFAULT_DISCOUNT_PERCENT,
      discountCents: 0,
      finalAmountCents: baseAmount,
      referrerCreditCents: 0,
      referralCode: readLocalCode(STORAGE_KEYS.referralClaimedCode),
      referrerUserId: null,
    }
  }

  const { data, error } = await supabase.rpc('reserve_referral_discount', {
    input_plan: plan,
    input_list_amount_cents: baseAmount,
    input_discount_percent: DEFAULT_DISCOUNT_PERCENT,
  })

  if (error) {
    return {
      status: 'rpc_error',
      plan,
      listAmountCents: baseAmount,
      discountPercent: DEFAULT_DISCOUNT_PERCENT,
      discountCents: 0,
      finalAmountCents: baseAmount,
      referrerCreditCents: 0,
      referralCode: null,
      referrerUserId: null,
      message: error.message,
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as ReserveRpcRow | null
  const status = (row?.status ?? 'unknown') as ReferralReservationResult['status']

  const reservation: ReferralReservationResult = {
    status,
    plan,
    listAmountCents: Number(row?.list_amount_cents ?? baseAmount),
    discountPercent: Number(row?.discount_percent ?? DEFAULT_DISCOUNT_PERCENT),
    discountCents: Number(row?.discount_cents ?? 0),
    finalAmountCents: Number(row?.final_amount_cents ?? baseAmount),
    referrerCreditCents: Number(row?.referrer_credit_cents ?? 0),
    referralCode: normalizeReferralCode(row?.referral_code ?? null),
    referrerUserId: row?.referrer_user_id ?? null,
    message: undefined,
  }

  if (reservation.status === 'reserved') {
    localStorage.setItem(
      STORAGE_KEYS.referralLastReservation,
      JSON.stringify({
        userId,
        ...reservation,
        updatedAt: new Date().toISOString(),
      })
    )
  }

  return reservation
}
