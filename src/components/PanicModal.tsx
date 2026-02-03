export const PanicModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Panic Button</h2>
        <p>3 Fragen, damit wir dir schnell helfen.</p>
        <div className="form-grid">
          <label>
            Was blockiert dich gerade?
            <input placeholder="z. B. Angst vor Methodik" />
          </label>
          <label>
            Wie viel Zeit hast du heute?
            <select>
              <option>30 Minuten</option>
              <option>60 Minuten</option>
              <option>90 Minuten</option>
              <option>2+ Stunden</option>
            </select>
          </label>
          <label>
            Was brauchst du jetzt?
            <select>
              <option>Struktur</option>
              <option>Feedback</option>
              <option>Motivation</option>
              <option>1:1 Hilfe</option>
            </select>
          </label>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Anfrage senden
          </button>
          <button className="ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
