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
        <h1>Pläne</h1>
        <p>Wähle den passenden Plan für deine Thesis-Begleitung.</p>
        <div className="cards-grid">
          <div className="plan-card">
            <h3>FREE</h3>
            <p>Alles für deinen strukturierten Start.</p>
            <div className="plan-price">0 €</div>
            <ul className="plain-list">
              <li>Status Check</li>
              <li>elea School</li>
              <li>elea Academia</li>
              <li>elea Community</li>
              <li>Countdown</li>
              <li>Mental Health Checker</li>
              <li>Fortschrittsanzeige</li>
              <li>Risiko Checker</li>
              <li>elea Struktur</li>
              <li>Aufgaben setzen</li>
            </ul>
            <button className="ghost" onClick={() => selectPlan('free')}>
              Kostenlos starten
            </button>
          </div>
          <div className="plan-card">
            <h3>BASIC</h3>
            <p>Alles aus FREE plus persönliche Thesis-Betreuung.</p>
            <div className="plan-price">590 €</div>
            <ul className="plain-list">
              <li>Alles aus FREE</li>
              <li>elea Quality Score</li>
              <li>Panic Button</li>
              <li>4x 1zu1 Betreuung mit Anna</li>
              <li>6x Gruppencalls</li>
            </ul>
            <button className="primary" onClick={() => selectPlan('basic')}>
              BASIC buchen
            </button>
          </div>
          <div className="plan-card highlight">
            <h3>PRO</h3>
            <p>Maximale Unterstützung bis zur Verteidigung.</p>
            <div className="plan-price">1.290 €</div>
            <ul className="plain-list">
              <li>Alles aus FREE und BASIC</li>
              <li>6 zusätzliche Gruppencalls</li>
              <li>2x 1zu1 Mock Defense</li>
              <li>Deine Thesis-Präsentation mit realistischer Verteidigungssituation.</li>
            </ul>
            <button className="primary" onClick={() => selectPlan('pro')}>
              PRO buchen
            </button>
          </div>
        </div>
      </div>
      <div className="page-card">
        <h2>Lektorat</h2>
        <p>
          Professionelle sprachliche und formale Überarbeitung deiner Thesis:
          Stil, Verständlichkeit, Rechtschreibung, Grammatik und wissenschaftliche
          Konsistenz.
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
