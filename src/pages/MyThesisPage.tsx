import { useState } from 'react'

const thesisParts = [
  'Theorie',
  'Empirie',
  'Methode',
  'Ergebnisse',
  'Diskusion',
  'Literaturangaben',
  'Anhang',
  'Titelblatt',
  'Inhaltsverzeichniss',
]

const MyThesisPage = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [partsStatus, setPartsStatus] = useState<Record<string, boolean>>(
    thesisParts.reduce((acc, part) => ({ ...acc, [part]: false }), {}),
  )

  const completedCount = thesisParts.filter((part) => partsStatus[part]).length

  return (
    <div className="page">
      <div className="page-card">
        <h1>My Thesis</h1>
        <p>Lade deine Arbeit hoch und behalte den Überblick über alle Pflichtteile.</p>
        <div className="upload-zone">
          <div>
            <div className="upload-title">Arbeit hochladen</div>
            <div className="upload-sub">PDF, Word oder ZIP</div>
          </div>
          <div className="upload-actions">
            <label className="primary">
              Datei auswählen
              <input
                type="file"
                accept=".pdf,.doc,.docx,.zip"
                onChange={(event) => setUploadedFile(event.target.files?.[0] ?? null)}
                hidden
              />
            </label>
            {uploadedFile ? (
              <div className="upload-file">Hochgeladen: {uploadedFile.name}</div>
            ) : (
              <div className="upload-file">Noch keine Datei hochgeladen</div>
            )}
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="thesis-overview-header">
          <h2>Übersicht der Pflichtteile</h2>
          <div className="status-chip">
            {completedCount}/{thesisParts.length} vollständig
          </div>
        </div>
        <div className="checklist">
          {thesisParts.map((part) => (
            <label key={part} className="checklist-row">
              <input
                type="checkbox"
                checked={partsStatus[part]}
                onChange={() =>
                  setPartsStatus((prev) => ({
                    ...prev,
                    [part]: !prev[part],
                  }))
                }
              />
              {part}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MyThesisPage
