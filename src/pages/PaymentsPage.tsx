import { startCheckout } from '../lib/payments'

const PaymentsPage = () => {
  return (
    <div className="page">
      <div className="page-card">
        <h1>Payment & Upsell</h1>
        <p>Wähle deinen Plan und sichere dir die Betreuung mit System.</p>
        <div className="cards-grid">
          <div className="plan-card">
            <h3>FREE</h3>
            <p>Online School + Checklisten + Countdown</p>
            <button className="ghost" onClick={() => startCheckout('free')}>
              Kostenlos starten
            </button>
          </div>
          <div className="plan-card">
            <h3>BASIC</h3>
            <p>1× Coaching/Woche + Support + Psychology Mode</p>
            <button className="primary" onClick={() => startCheckout('basic')}>
              Jetzt buchen
            </button>
          </div>
          <div className="plan-card highlight">
            <h3>PRO</h3>
            <p>2× Coaching/Woche + Feedback + Quality Score™</p>
            <button className="primary" onClick={() => startCheckout('pro')}>
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
