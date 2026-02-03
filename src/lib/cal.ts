const CAL_BASE_URL = 'https://cal.com'

export const openCalBooking = (eventType: string) => {
  const url = `${CAL_BASE_URL}/elea/${eventType}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
