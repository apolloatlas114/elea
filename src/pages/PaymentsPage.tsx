import { startCheckout } from '../lib/payments'
import { useAuth } from '../context/AuthContext'
import type { Plan } from '../lib/storage'
import { STORAGE_KEYS } from '../lib/storage'
import { savePlan } from '../lib/supabaseData'

const PaymentsPage = () => {
  const { user } = useAuth()

  const selectPlan = (plan: Plan) => {
    localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(plan))
    if (user) {
      savePlan(user.id, plan).catch((error) => {
        console.error('Plan speichern fehlgeschlagen', error)
      })
    }
    startCheckout(plan)
  }

  return (
    <div className="page payments-page">
      <div className="page-card">
        <h1>Payment & Upsell</h1>
        <p>Wähle deinen Plan und sichere dir die Betreuung mit System.</p>
        <div className="cards-grid">
          <div className="plan-card">
            <h3>FREE</h3>
            <p>Online School + Checklisten + Countdown</p>
            <ul className="plain-list">
              <li>Kompletter Zugriff auf alle Videos</li>
              <li>Checklisten und Roadmaps</li>
              <li>Persoenlicher Fortschritts-Tracker</li>
            </ul>
            <button className="ghost" onClick={() => selectPlan('free')}>
              Kostenlos starten
            </button>
          </div>
          <div className="plan-card">
            <h3>BASIC</h3>
            <p>1x Coaching/Woche + Support + Psychology Mode</p>
            <ul className="plain-list">
              <li>Woechentliche Coaching-Session</li>
              <li>Formatvorlagen + Feedback zu Struktur</li>
              <li>E-Mail Support innerhalb 48h</li>
            </ul>
            <button className="primary" onClick={() => selectPlan('basic')}>
              Jetzt buchen
            </button>
          </div>
          <div className="plan-card highlight">
            <h3>PRO</h3>
            <p>2x Coaching/Woche + Feedback + Quality Score</p>
            <ul className="plain-list">
              <li>2x Coaching mit festen Slots</li>
              <li>Expose- und Gliederungsfeedback</li>
              <li>Priorisierter Support + Rescue Session</li>
            </ul>
            <button className="primary" onClick={() => selectPlan('pro')}>
              Erfolg sichern
            </button>
          </div>
        </div>
      </div>
      <div className="page-card">
        <h2>Upsell: Lektorat</h2>
        <p>Einmalig 750 € · Für alle Pläne verfügbar.</p>
        <button className="primary" onClick={() => startCheckout('lektorat')}>
          Lektorat hinzufügen
        </button>
      </div>
    </div>
  )
}

export default PaymentsPage
