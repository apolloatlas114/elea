import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { openCalBooking } from '../lib/cal'
import { loadBookings } from '../lib/supabaseData'
import type { BookingEntry } from '../lib/storage'

const CoachingPage = () => {
  const { user } = useAuth()
  const [bookings, setBookings] = useState<BookingEntry[]>([])

  useEffect(() => {
    let active = true
    if (!user) {
      setBookings([])
      return () => {}
    }
    loadBookings(user.id).then((remote) => {
      if (!active) return
      setBookings(remote)
    })
    return () => {
      active = false
    }
  }, [user?.id])

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  }, [bookings])

  return (
    <div className="page coaching-page">
      <div className="page-card">
        <h1>Coaching</h1>
        <p>Buche deinen Slot direkt ueber Cal.com - ohne Sales Call.</p>
        <div className="page-actions">
          <button className="primary" onClick={() => openCalBooking('coaching-intro')}>
            Erstgespraech buchen
          </button>
          <button className="ghost" onClick={() => openCalBooking('coaching-weekly')}>
            Wochen-Coaching
          </button>
        </div>
      </div>
      <div className="page-card">
        <h2>Deine Termine</h2>
        {sortedBookings.length === 0 ? (
          <div className="muted">Noch keine Termine gebucht.</div>
        ) : (
          <div className="feed">
            {sortedBookings.map((booking) => (
              <div key={`${booking.date}-${booking.time}`} className="plan-item">
                <div>
                  <div className="plan-title">1:1 PhD Call</div>
                  <div className="plan-sub">{booking.date} - {booking.time}</div>
                </div>
                <span className="pill">Fix</span>
              </div>
            ))}
          </div>
        )}
        <div className="plan-item">
          <div>
            <div className="plan-title">Gruppen Call</div>
            <div className="plan-sub">Jeden Samstag - 11:00</div>
          </div>
          <div className="checkbox-wrapper-5 plan-fix-toggle">
            <div className="check">
              <input id="group-call-fix-coaching" type="checkbox" checked readOnly />
              <label htmlFor="group-call-fix-coaching" aria-label="Gruppen Call fix" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CoachingPage
