import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getPlanListAmountCents, reserveReferralDiscount } from '../lib/referrals'
import { startCheckout } from '../lib/payments'
import { savePlan } from '../lib/supabaseData'
import type { Plan } from '../lib/storage'
import { STORAGE_KEYS, parseJson } from '../lib/storage'

const PaymentsPage = () => {
  const { user } = useAuth()
  const [currentPlan, setCurrentPlan] = useState<Plan>(() => parseJson(localStorage.getItem(STORAGE_KEYS.plan), 'free'))
  const [discountNotice, setDiscountNotice] = useState<string | null>(null)

  useEffect(() => {
    const onStorage = () => {
      setCurrentPlan(parseJson(localStorage.getItem(STORAGE_KEYS.plan), 'free'))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const selectPlan = async (plan: Plan) => {
    if (plan === 'free' && currentPlan === 'free') return

    localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(plan))
    setCurrentPlan(plan)

    if (user) {
      savePlan(user.id, plan).catch((error) => {
        console.error('Plan speichern fehlgeschlagen', error)
      })
    }

    let checkoutAmountCents: number | undefined
    let source = 'checkout_button'

    if ((plan === 'basic' || plan === 'pro') && user) {
      const reservation = await reserveReferralDiscount({
        userId: user.id,
        plan,
        listAmountCents: getPlanListAmountCents(plan),
      })

      if (reservation.status === 'reserved') {
        checkoutAmountCents = reservation.finalAmountCents
        source = 'checkout_referral_reserved'
        setDiscountNotice(
          `Referral aktiv: ${reservation.discountPercent}% Rabatt reserviert (${(
            reservation.discountCents / 100
          ).toFixed(2)} EUR).`
        )
      } else if (reservation.status === 'rpc_error') {
        setDiscountNotice('Referral-Rabatt konnte gerade nicht reserviert werden. Du kannst normal fortfahren.')
      } else if (reservation.status === 'no_referral') {
        setDiscountNotice('Kein Referral verknüpft. Du kannst jederzeit einen Empfehlungslink nutzen.')
      } else {
        setDiscountNotice(null)
      }
    } else {
      setDiscountNotice(null)
    }

    startCheckout(plan, { amountCents: checkoutAmountCents, source })
  }

  const isFreeCurrent = currentPlan === 'free'
  const freePlanLabel = isFreeCurrent ? 'Aktueller Plan' : 'Bereits gesichert.'

  return (
    <div className="page payments-page">
      <div className="page-card">
        <h1>Pläne</h1>
        <p>Wähle den passenden Plan für deine Thesis-Begleitung.</p>
        {discountNotice && <p className="muted payments-discount-note">{discountNotice}</p>}

        <div className="plans-grid">
          <article className="card-container elea-plan-card elea-plan-free">
            <div className="title-card">
              <p>elea Free</p>
              <span className="plan-title-badge">Start</span>
            </div>
            <div className="card-content">
              <div className="plan-title-wrap">
                <h3>FREE</h3>
                <p>Alles für deinen strukturierten Start.</p>
              </div>

              <div className="plan-price compact">
                <span className="plan-price-label">Preis</span>
                <span className="plan-price-value">0 €</span>
              </div>

              <div className="card-separate">
                <span className="separate" />
                Features
                <span className="separate" />
              </div>

              <ul className="card-list-features">
                <li className="option">Status Check</li>
                <li className="option">elea School</li>
                <li className="option">elea Academia</li>
                <li className="option">elea Community</li>
                <li className="option">Countdown</li>
                <li className="option">Mental Health Checker</li>
                <li className="option">Fortschrittsanzeige</li>
                <li className="option">Risiko Checker</li>
                <li className="option">elea Struktur</li>
                <li className="option">Aufgaben setzen</li>
              </ul>

              <button className="card-btn is-current" onClick={() => void selectPlan('free')} disabled>
                {freePlanLabel}
              </button>
            </div>
          </article>

          <article className="card-container elea-plan-card elea-plan-basic">
            <div className="title-card">
              <p>elea Basic</p>
              <span className="plan-title-badge">Beliebt</span>
            </div>
            <div className="card-content">
              <div className="plan-title-wrap">
                <h3>BASIC</h3>
                <p>Alles aus FREE plus persönliche Thesis-Betreuung.</p>
              </div>

              <div className="plan-price compact">
                <span className="plan-price-label">Preis</span>
                <span className="plan-price-value">590 €</span>
              </div>

              <div className="card-separate">
                <span className="separate" />
                Features
                <span className="separate" />
              </div>

              <ul className="card-list-features">
                <li className="option">Alles aus FREE</li>
                <li className="option">elea Quality Score</li>
                <li className="option">Panic Button</li>
                <li className="option">4x 1zu1 Betreuung mit Anna</li>
                <li className="option">6x Gruppencalls</li>
                <li className="option">48h Nachrichten Support</li>
              </ul>

              <button className="card-btn" onClick={() => void selectPlan('basic')}>
                BASIC buchen
              </button>
            </div>
          </article>

          <article className="card-container elea-plan-card elea-plan-pro">
            <div className="title-card">
              <p>elea Pro</p>
              <span className="plan-title-badge">Premium</span>
            </div>
            <div className="card-content">
              <div className="plan-title-wrap">
                <h3>PRO</h3>
                <p>Maximale Unterstützung bis zur Verteidigung.</p>
              </div>

              <div className="plan-price compact">
                <span className="plan-price-label">Preis</span>
                <span className="plan-price-value">1.290 €</span>
              </div>

              <div className="card-separate">
                <span className="separate" />
                Features
                <span className="separate" />
              </div>

              <ul className="card-list-features">
                <li className="option">Alles aus FREE und BASIC</li>
                <li className="option">6 zusätzliche Gruppencalls</li>
                <li className="option">2x 1zu1 Mock Defense</li>
                <li className="option">24h Nachrichten Support</li>
                <li className="option">Thesis-Präsentation mit realistischer Verteidigungssituation</li>
              </ul>

              <button className="card-btn" onClick={() => void selectPlan('pro')}>
                PRO buchen
              </button>
            </div>
          </article>
        </div>
      </div>

      <div className="page-card">
        <h2>Lektorat</h2>
        <p>
          Professionelle sprachliche und formale Überarbeitung deiner Thesis: Stil,
          Verständlichkeit, Rechtschreibung, Grammatik und wissenschaftliche Konsistenz.
        </p>
        <p className="muted">Einmalig 750 € · separat buchbar, unabhängig von deinem Plan.</p>
        <button className="primary" onClick={() => startCheckout('lektorat')}>
          Lektorat separat buchen
        </button>
      </div>
    </div>
  )
}

export default PaymentsPage
