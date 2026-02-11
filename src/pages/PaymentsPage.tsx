import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getPlanListAmountCents, reserveReferralDiscount } from '../lib/referrals'
import { startCheckout } from '../lib/payments'
import { savePlan } from '../lib/supabaseData'
import type { Plan } from '../lib/storage'
import { STORAGE_KEYS, parseJson } from '../lib/storage'

const PLAN_LABELS: Record<Plan, string> = {
  free: 'FREE',
  study: 'STUDY',
  basic: 'BASIC',
  pro: 'PRO',
}

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
    if (plan === currentPlan) return

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
        setDiscountNotice('Kein Referral verknuepft. Du kannst jederzeit einen Empfehlungslink nutzen.')
      } else {
        setDiscountNotice(null)
      }
    } else {
      setDiscountNotice(null)
    }

    startCheckout(plan, { amountCents: checkoutAmountCents, source })
  }

  const isCurrent = (plan: Plan) => currentPlan === plan
  const ctaLabel = (plan: Plan) => {
    if (isCurrent(plan)) return 'Aktueller Plan'
    if (plan === 'free') return 'FREE aktivieren'
    return `${PLAN_LABELS[plan]} buchen`
  }

  return (
    <div className="page payments-page">
      <div className="page-card">
        <h1>Plaene</h1>
        <p>Waehle den Plan, der zu deinem aktuellen Lern- und Thesis-Setup passt.</p>
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
                <p>Der schnelle Einstieg mit allen Kernfunktionen fuer den Alltag.</p>
              </div>

              <div className="plan-price compact">
                <span className="plan-price-label">Preis</span>
                <span className="plan-price-value">0 EUR</span>
              </div>

              <div className="card-separate">
                <span className="separate" />
                Features
                <span className="separate" />
              </div>

              <ul className="card-list-features">
                <li className="option">Status Check</li>
                <li className="option">Frag elea 1x taeglich</li>
                <li className="option">Lernlabor: Upload Doc - Lern-PDF - Multiple Choice Test (7 Tage Trial)</li>
                <li className="option">Academia: wichtige Unterlagen downloaden</li>
                <li className="option">Notehub Trial 7 Tage (Voice - Text - Aufgabe), Notizen bleiben im Feed</li>
                <li className="option">Smartsearch in Unterlagen, Notizen und Aufgaben</li>
                <li className="option">Dokumente Upload</li>
                <li className="option">Countdown (Pruefung/Thesis)</li>
                <li className="option">Mental Health Checker</li>
                <li className="option">Fortschrittsanzeige</li>
                <li className="option">Risiko Checker</li>
                <li className="option">Aufgaben setzen</li>
              </ul>

              <button className={`card-btn ${isCurrent('free') ? 'is-current' : ''}`} onClick={() => void selectPlan('free')} disabled={isCurrent('free')}>
                {ctaLabel('free')}
              </button>
            </div>
          </article>

          <article className="card-container elea-plan-card elea-plan-study">
            <div className="title-card">
              <p>elea Study</p>
              <span className="plan-title-badge">Neu</span>
            </div>
            <div className="card-content">
              <div className="plan-title-wrap">
                <h3>STUDY</h3>
                <p>Mehr Speed im Studium mit Unlimited-Tools und schnellerem Support.</p>
              </div>

              <div className="plan-price compact">
                <span className="plan-price-label">Preis</span>
                <span className="plan-price-value">4,90 EUR / Monat</span>
              </div>

              <p className="muted">Monatlich kuendbar. Kurzfristig: 50% Referral-Rabatt fuer beide.</p>

              <div className="card-separate">
                <span className="separate" />
                Features
                <span className="separate" />
              </div>

              <ul className="card-list-features">
                <li className="option">Alles aus FREE + elea School (Video Bibliothek)</li>
                <li className="option">Frag elea unlimited</li>
                <li className="option">Chat Support (72h Response Time)</li>
                <li className="option">Lernlabor unlimited</li>
                <li className="option">Notehub unlimited</li>
                <li className="option">Schwaechen-Analyse: zeigt dir sofort die groessten Luecken in Inhalt, Struktur und Argumentation.</li>
                <li className="option">Community (Connect with StudyBuddy)</li>
                <li className="option">elea Quality Score: Hausarbeiten komplett oder in Teilen schnell auf hohe Standards pruefen.</li>
                <li className="option">Panic Button: direkter Schnellzugriff bei Stress-Spitzen, Blockaden oder Ueberforderung.</li>
              </ul>

              <button className={`card-btn ${isCurrent('study') ? 'is-current' : ''}`} onClick={() => void selectPlan('study')} disabled={isCurrent('study')}>
                {ctaLabel('study')}
              </button>
            </div>
          </article>

          <article className="card-container elea-plan-card elea-plan-basic">
            <div className="title-card">
              <p>elea Basic</p>
              <span className="plan-title-badge">Coaching</span>
            </div>
            <div className="card-content">
              <div className="plan-title-wrap">
                <h3>BASIC</h3>
                <p>Study plus persoenliche Betreuung fuer regelmaessige Umsetzung.</p>
              </div>

              <div className="plan-price compact">
                <span className="plan-price-label">Preis</span>
                <span className="plan-price-value">590 EUR one-time</span>
              </div>

              <div className="card-separate">
                <span className="separate" />
                Features
                <span className="separate" />
              </div>

              <ul className="card-list-features">
                <li className="option">Alles aus FREE und STUDY</li>
                <li className="option">4 x 1zu1 Betreuung mit Anna</li>
                <li className="option">6 x Gruppen Calls</li>
                <li className="option">Chat Support (48h Response Time)</li>
              </ul>

              <button className={`card-btn ${isCurrent('basic') ? 'is-current' : ''}`} onClick={() => void selectPlan('basic')} disabled={isCurrent('basic')}>
                {ctaLabel('basic')}
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
                <p>Maximale Intensitaet bis zur finalen Verteidigung.</p>
              </div>

              <div className="plan-price compact">
                <span className="plan-price-label">Preis</span>
                <span className="plan-price-value">1290 EUR one-time</span>
              </div>

              <div className="card-separate">
                <span className="separate" />
                Features
                <span className="separate" />
              </div>

              <ul className="card-list-features">
                <li className="option">Alles aus FREE, STUDY und BASIC</li>
                <li className="option">6 zusaetzliche Gruppen Calls</li>
                <li className="option">2 x 1zu1 Mock Defense</li>
                <li className="option">Thesis-Praesentation mit realistischer Verteidigungssituation</li>
                <li className="option">Chat Support (24h Response Time)</li>
              </ul>

              <button className={`card-btn ${isCurrent('pro') ? 'is-current' : ''}`} onClick={() => void selectPlan('pro')} disabled={isCurrent('pro')}>
                {ctaLabel('pro')}
              </button>
            </div>
          </article>
        </div>
      </div>

      <div className="page-card">
        <h2>Lektorat</h2>
        <p>
          Professionelle sprachliche und formale Ueberarbeitung deiner Thesis: Stil, Verstaendlichkeit,
          Rechtschreibung, Grammatik und wissenschaftliche Konsistenz.
        </p>
        <p className="muted">Einmalig 750 EUR, separat buchbar und unabhaengig von deinem Plan.</p>
        <button className="primary" onClick={() => startCheckout('lektorat')}>
          Lektorat separat buchen
        </button>
      </div>
    </div>
  )
}

export default PaymentsPage
