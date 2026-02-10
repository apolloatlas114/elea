import { recordFinanceEvent } from './adminData'

type CheckoutProduct = 'free' | 'basic' | 'pro' | 'lektorat'

type CheckoutOptions = {
  amountCents?: number
  source?: string
}

const AMOUNT_BY_PRODUCT: Record<CheckoutProduct, number> = {
  free: 0,
  basic: 59000,
  pro: 129000,
  lektorat: 75000,
}

export const startCheckout = (product: CheckoutProduct, options: CheckoutOptions = {}) => {
  const listAmountCents = AMOUNT_BY_PRODUCT[product]
  const checkoutAmountCents = options.amountCents ?? listAmountCents
  const amountLine =
    product === 'free' ? '' : `\nBetrag aktuell: ${(checkoutAmountCents / 100).toFixed(2)} EUR`

  const message =
    product === 'free'
      ? 'Du startest jetzt im FREE-Bereich.'
      : `Checkout für ${product.toUpperCase()} wird vorbereitet.${amountLine}`

  alert(message)
  console.info('Checkout gestartet:', product, checkoutAmountCents)

  if (product !== 'free') {
    void recordFinanceEvent({
      plan: product === 'lektorat' ? 'pro' : product,
      amountCents: checkoutAmountCents,
      status: 'initiated',
      source: options.source ?? 'checkout_button',
    })
  }
}
