import { recordFinanceEvent } from './adminData'

type CheckoutProduct = 'free' | 'basic' | 'pro' | 'lektorat'

export const startCheckout = (product: CheckoutProduct) => {
  const message =
    product === 'free'
      ? 'Du startest jetzt im FREE-Bereich.'
      : `Checkout für ${product.toUpperCase()} wird vorbereitet.`
  alert(message)
  console.info('Checkout gestartet:', product)

  const amountByPlan: Record<CheckoutProduct, number> = {
    free: 0,
    basic: 59000,
    pro: 129000,
    lektorat: 75000,
  }

  if (product !== 'free') {
    void recordFinanceEvent({
      plan: product === 'lektorat' ? 'pro' : product,
      amountCents: amountByPlan[product],
      status: 'initiated',
      source: 'checkout_button',
    })
  }
}
