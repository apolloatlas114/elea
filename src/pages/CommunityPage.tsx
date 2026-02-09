import { useMemo, useState, type ComponentType } from 'react'
import {
  Award,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ShieldCheck,
  UserRoundSearch,
} from 'lucide-react'

type CommunityTab = 'leaderboard' | 'trends' | 'templates' | 'matching'

const tabItems: { id: CommunityTab; title: string; label: string; icon: ComponentType<{ size?: number | string }> }[] = [
  { id: 'leaderboard', title: 'Leaderboard', label: 'Top Elea Scores', icon: Award },
  { id: 'trends', title: 'Trends', label: 'Fach-spezifisch', icon: BarChart3 },
  { id: 'templates', title: 'Templates', label: 'Downloads', icon: BookOpenCheck },
  { id: 'matching', title: 'Partner-Suche', label: 'Opt-in', icon: UserRoundSearch },
]

const leaderboardRows = [
  { initials: 'M.M.', structure: 9.2, originality: 8.4, quality: 9.1 },
  { initials: 'A.K.', structure: 8.9, originality: 8.7, quality: 8.8 },
  { initials: 'L.S.', structure: 8.7, originality: 8.2, quality: 8.6 },
  { initials: 'J.B.', structure: 8.5, originality: 8.1, quality: 8.4 },
]

const trendRows = [
  { field: 'BWL', momentum: 82, topRisk: 'Methodik-Setup', solvedBy: 'Checklisten + Buddy-Review' },
  { field: 'Psychologie', momentum: 77, topRisk: 'Zeitplanung', solvedBy: 'Wochenrhythmus + Deadline-Tracking' },
  { field: 'Soziologie', momentum: 73, topRisk: 'Roter Faden', solvedBy: 'Kapitelstruktur + Feedback-Loops' },
  { field: 'Informatik', momentum: 79, topRisk: 'Dokumentation', solvedBy: 'Template + Quality-Checks' },
]

const templateRows = [
  { name: 'Abstract Template', downloads: 1247, weekly: 211, access: 'Anonymisierte Metadaten' },
  { name: 'Methodik Checklist', downloads: 892, weekly: 184, access: 'Premium-Upload, anonymisiert' },
  { name: 'Diskussion Leitfaden', downloads: 664, weekly: 132, access: 'Premium-Upload, anonymisiert' },
  { name: 'Verteidigung Struktur', downloads: 518, weekly: 107, access: 'Community-geprüft' },
]

const buddyPool = [
  { code: 'B-29', semester: '6. Semester', activityScore: 91, qualityScore: 8.9, status: 'Double Opt-in bereit' },
  { code: 'B-13', semester: '7. Semester', activityScore: 86, qualityScore: 8.4, status: 'Double Opt-in bereit' },
  { code: 'B-44', semester: '6. Semester', activityScore: 72, qualityScore: 7.7, status: 'Wartet auf Betreuer-Release' },
]

const CommunityPage = () => {
  const [activeTab, setActiveTab] = useState<CommunityTab>('leaderboard')
  const [matchingOptIn, setMatchingOptIn] = useState(false)

  const matchingRule = useMemo(() => {
    const qualityThreshold = 8
    const activityThreshold = 80
    const qualified = buddyPool.filter((buddy) => buddy.activityScore >= activityThreshold && buddy.qualityScore >= qualityThreshold)
    return {
      activityThreshold,
      qualityThreshold,
      qualifiedCount: qualified.length,
      qualified,
    }
  }, [])

  return (
    <div className="community-dashboard">
      <aside className="community-sidebar panel-card">
        <div className="community-sidebar-head">
          <h1>Community</h1>
          <p>Features, die Wissen teilen statt Plattschreden - mit starker Privacy-Control.</p>
        </div>

        <div className="community-safe-chip">
          <ShieldCheck size={16} />
          <span>Safe Features - kein sensibles Teilen</span>
        </div>

        <nav className="community-tab-list" aria-label="Community Navigation">
          {tabItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id

            return (
              <button
                key={item.id}
                type="button"
                className={`community-tab-button ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className="community-tab-icon">
                  <Icon size={16} />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.label}</small>
                </span>
              </button>
            )
          })}
        </nav>

      </aside>

      <main className="community-main">
        <section className="community-kpi-grid">
          <article className="community-kpi-card panel-card">
            <p>Aktive Studierende</p>
            <strong>1.947</strong>
            <span>Wöchentlich aktive, anonymisierte Community-Sessions</span>
          </article>
          <article className="community-kpi-card panel-card">
            <p>Template Downloads</p>
            <strong>4.321</strong>
            <span>Nur anonymisierte Metadaten sichtbar</span>
          </article>
          <article className="community-kpi-card panel-card">
            <p>Double Opt-in Matches</p>
            <strong>286</strong>
            <span>Buddy Release für alle, auch FREE User</span>
          </article>
        </section>

        <section className="community-focus panel-card">
          {activeTab === 'leaderboard' && (
            <div className="community-section">
              <header>
                <h2>Achievement Leaderboards</h2>
                <p>Nur Initialen + Score, keine Themen oder Inhaltsdetails.</p>
              </header>
              <ul className="community-rank-list">
                {leaderboardRows.map((row, index) => (
                  <li key={row.initials} className="community-rank-item">
                    <div className="community-rank-head">
                      <span className="community-rank-pos">#{index + 1}</span>
                      <strong>{row.initials}</strong>
                    </div>
                    <div className="community-score-grid">
                      <span>Struktur: {row.structure.toFixed(1)}/10</span>
                      <span>Originalität: {row.originality.toFixed(1)}/10</span>
                      <span>Quality: {row.quality.toFixed(1)}/10</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'trends' && (
            <div className="community-section">
              <header>
                <h2>Trends - fach-spezifisch</h2>
                <p>Wo Studierende aktuell am meisten hängen und was nachweislich hilft.</p>
              </header>
              <div className="community-trend-grid">
                {trendRows.map((trend) => (
                  <article key={trend.field} className="community-trend-item">
                    <div className="community-trend-head">
                      <strong>{trend.field}</strong>
                      <span>{trend.momentum}% Momentum</span>
                    </div>
                    <div className="community-trend-bar">
                      <span style={{ width: `${trend.momentum}%` }} />
                    </div>
                    <p>Top Risiko: {trend.topRisk}</p>
                    <small>Hilft am meisten: {trend.solvedBy}</small>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="community-section">
              <header>
                <h2>Template Library</h2>
                <p>Uploads nur von Premium-Usern, Anzeige strikt anonymisiert.</p>
              </header>
              <div className="community-template-grid">
                {templateRows.map((template) => (
                  <article key={template.name} className="community-template-item">
                    <div>
                      <strong>{template.name}</strong>
                      <small>{template.access}</small>
                    </div>
                    <div className="community-template-meta">
                      <span>{template.downloads.toLocaleString('de-DE')} Gesamt-Downloads</span>
                      <span>{template.weekly.toLocaleString('de-DE')} letzte Woche</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'matching' && (
            <div className="community-section">
              <header>
                <h2>Matchmaking (Opt-in)</h2>
                <p>Anonymer Chat nur nach Double Opt-in und Betreuer-Release.</p>
              </header>

              <div className="community-match-top">
                <button type="button" className={`community-optin ${matchingOptIn ? 'active' : ''}`} onClick={() => setMatchingOptIn((prev) => !prev)}>
                  <UserRoundSearch size={15} />
                  <span>{matchingOptIn ? 'Opt-in aktiv' : 'Opt-in aktivieren'}</span>
                </button>
                <div className="community-rule-card">
                  <CheckCircle2 size={15} />
                  <span>
                    Buddy Release für alle. Mindestregel: mind. 1 Partner mit Aktivitäts-Score {`>=${matchingRule.activityThreshold}`} und
                    Quality Score {`>=${matchingRule.qualityThreshold.toFixed(1)}`}.
                  </span>
                </div>
              </div>

              <div className="community-buddy-grid">
                {buddyPool.map((buddy) => (
                  <article key={buddy.code} className="community-buddy-item">
                    <strong>{buddy.code}</strong>
                    <p>{buddy.semester}</p>
                    <small>Aktivität: {buddy.activityScore}</small>
                    <small>Quality: {buddy.qualityScore.toFixed(1)}</small>
                    <span>{buddy.status}</span>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

      </main>

      <div className="community-coming-soon-layer" role="status" aria-live="polite">
        <div className="community-coming-soon-text">Coming soon.</div>
      </div>
    </div>
  )
}

export default CommunityPage
