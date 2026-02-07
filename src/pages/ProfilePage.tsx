import type { Profile } from '../lib/storage'
import { STORAGE_KEYS, parseJson } from '../lib/storage'
import { useAuth } from '../context/AuthContext'

const ProfilePage = () => {
  const { logout } = useAuth()
  const profile = parseJson<Profile | null>(localStorage.getItem(STORAGE_KEYS.profile), null)

  return (
    <div className="page profile-page">
      <div className="page-card">
        <h1>Profil</h1>
        <p>Deine Stammdaten für Planung und Psychologie.</p>
        {profile ? (
          <div className="profile-grid">
            <div>
              <div className="muted">Studiengang</div>
              <div>{profile.studiengang}</div>
            </div>
            <div>
              <div className="muted">Hochschule</div>
              <div>{profile.hochschule || '—'}</div>
            </div>
            <div>
              <div className="muted">Abgabedatum</div>
              <div>{profile.abgabedatum}</div>
            </div>
            <div>
              <div className="muted">Status</div>
              <div>{profile.status}%</div>
            </div>
            <div>
              <div className="muted">Zielnote</div>
              <div>{profile.zielnote}</div>
            </div>
          </div>
        ) : (
          <div className="muted">Kein Profil vorhanden. Bitte im Dashboard ausfüllen.</div>
        )}
        <div className="page-actions">
          <button className="ghost" onClick={() => logout()}>
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
