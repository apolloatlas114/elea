const CommunityPage = () => {
  return (
    <div className="page">
      <div className="page-card">
        <h1>Community</h1>
        <p>Erfolge, Fragen und Motivation im geschützten Raum.</p>
        <div className="feed">
          <div className="feed-item">
            <strong>Sarah (LMU)</strong> hat ihr Exposé abgegeben. 🎉
          </div>
          <div className="feed-item">
            <strong>Jonas (TU)</strong> startet mit PRO und bucht 2 Slots.
          </div>
          <div className="feed-item">
            <strong>Lina (RWTH)</strong> sucht Feedback zur Gliederung.
          </div>
        </div>
      </div>
      <div className="page-card">
        <h2>Community Call</h2>
        <p>Nächster Live-Call: Donnerstag 19:00. Thema: Methodik.</p>
        <button className="primary">Teilnehmen</button>
      </div>
    </div>
  )
}

export default CommunityPage
