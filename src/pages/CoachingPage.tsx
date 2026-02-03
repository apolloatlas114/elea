import { openCalBooking } from '../lib/cal'

const CoachingPage = () => {
  return (
    <div className="page">
      <div className="page-card">
        <h1>Coaching</h1>
        <p>Buche deinen Slot direkt über Cal.com – ohne Sales Call.</p>
        <div className="page-actions">
          <button className="primary" onClick={() => openCalBooking('coaching-intro')}>
            Erstgespräch buchen
          </button>
          <button className="ghost" onClick={() => openCalBooking('coaching-weekly')}>
            Wochen-Coaching
          </button>
        </div>
      </div>
      <div className="page-card">
        <h2>Deine nächsten Termine</h2>
        <div className="plan-item">
          <div>
            <div className="plan-title">Methodik-Check</div>
            <div className="plan-sub">Mittwoch, 18:30</div>
          </div>
          <span className="pill">Fix</span>
        </div>
        <div className="plan-item">
          <div>
            <div className="plan-title">Struktur-Sprint</div>
            <div className="plan-sub">Freitag, 10:00</div>
          </div>
          <span className="pill">Live</span>
        </div>
      </div>
    </div>
  )
}

export default CoachingPage
