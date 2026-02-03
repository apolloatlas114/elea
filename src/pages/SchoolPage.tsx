const SchoolPage = () => {
  return (
    <div className="page">
      <div className="page-card">
        <h1>Online School</h1>
        <p>Dein strukturierter Lernpfad von der Themenfindung bis zur Verteidigung.</p>
        <div className="cards-grid">
          {[
            'Themenfindung',
            'Exposé',
            'Literatur',
            'Methodik',
            'Datenerhebung',
            'Statistik',
            'Schreiben',
            'Zitieren',
          ].map((item, index) => (
            <div key={item} className="mini-card">
              <div className="mini-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="mini-title">{item}</div>
              <div className="mini-sub">Video + Checkliste</div>
            </div>
          ))}
        </div>
      </div>
      <div className="page-card">
        <h2>Checklisten</h2>
        <div className="checklist">
          <label>
            <input type="checkbox" defaultChecked /> Thema finalisieren
          </label>
          <label>
            <input type="checkbox" /> 5 Kernquellen sichern
          </label>
          <label>
            <input type="checkbox" /> Exposé-Struktur aufsetzen
          </label>
        </div>
      </div>
      <div className="page-card">
        <h2>Roadmap</h2>
        <div className="roadmap">
          <div className="roadmap-step active">Aktuell: Exposé</div>
          <div className="roadmap-step">Als Nächstes: Methodik</div>
          <div className="roadmap-step">Danach: Datenerhebung</div>
        </div>
      </div>
    </div>
  )
}

export default SchoolPage
