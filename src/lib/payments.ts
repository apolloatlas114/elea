type CheckoutProduct = 'free' | 'basic' | 'pro' | 'lektorat'

export const startCheckout = (product: CheckoutProduct) => {
  const message =
    product === 'free'
      ? 'Du startest jetzt im FREE-Bereich.'
      : `Checkout für ${product.toUpperCase()} wird vorbereitet.`
  alert(message)
  console.info('Checkout gestartet:', product)
}
