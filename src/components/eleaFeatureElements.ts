export type EleaFeatureItem = {
  id: string
  label: string
  description: string
}

export const eleaFeatureItems: EleaFeatureItem[] = [
  {
    id: 'status-check',
    label: 'Status Check',
    description:
      '5-Fragen-Einstufungstest, der deinen aktuellen Stand bewertet und dir inkl. Begruendung einen passenden Plan (free, study, basic, pro) empfiehlt.',
  },
  {
    id: 'frag-elea',
    label: 'Frag Elea',
    description:
      'Du stellst Fragen per Text oder Mikrofon und bekommst eine einfache Erklaerung mit Beispielen und naechsten Schritten; daraus kannst du direkt Aufgaben und Lernlabor-Quiz erzeugen.',
  },
  {
    id: 'elea-lernlabor',
    label: 'Elea Lernlabor',
    description:
      'PDF hochladen, Lern-Sheet erhalten, Thema strukturiert lernen und in Quiz-Leveln (easy, medium, hard) mit Timer und Feedback trainieren.',
  },
  {
    id: 'academia',
    label: 'Academia',
    description:
      'Zentraler Bereich fuer Methodenwissen/Vorlagen als Download-Bibliothek (aktuell als Elea-Academia-Ordner im Dashboard).',
  },
  {
    id: 'notehub',
    label: 'Notehub',
    description:
      'Notizen mit Prioritaet, Tags sowie Verknuepfung zu Dokumenten/Aufgaben; inklusive Sprach-Input und Live-Sync.',
  },
  {
    id: 'smartsearch',
    label: 'Smartsearch',
    description: 'Schnellsuche ueber Dokumente, Aufgaben und Notizen mit direkten Spruengen in den passenden Bereich.',
  },
  {
    id: 'dokumente-upload',
    label: 'Dokumente Upload',
    description:
      'Mehrfach-Upload fuer PDF/DOC/DOCX, inkl. Such-/Filterfunktionen, Duplikatvermeidung und Dokument-Analytics.',
  },
  {
    id: 'countdown',
    label: 'Countdown',
    description: 'Laufender Abgabe-Countdown (Tage/Stunden/Minuten/Sekunden), damit dein Zeitdruck jederzeit sichtbar bleibt.',
  },
  {
    id: 'mental-health-checker',
    label: 'Mental Health Checker',
    description: 'Stress-Level tracken, taeglich speichern, 7-Tage-Verlauf und Fruehwarnung bei anhaltend hoher Belastung.',
  },
  {
    id: 'fortschrittsanzeige',
    label: 'Fortschrittsanzeige',
    description: 'Fortschritt in % aus Status, Quiz, Uploads, Checklisten, Aufgabenrhythmus, Plan und Stressfaktor.',
  },
  {
    id: 'risiko-checker',
    label: 'Risiko Checker',
    description: 'Risiko-Level (niedrig/mittel/hoch) auf Basis von Fortschritt, verbleibender Zeit, Stress und Betreuungsstatus.',
  },
  {
    id: 'aufgaben-setzen',
    label: 'Aufgaben setzen',
    description: 'Priorisierte Aufgaben mit Deadline, Beschreibung und Dokument-Link erstellen, filtern und als erledigt markieren.',
  },
  {
    id: 'elea-school',
    label: 'Elea School',
    description: 'Modulbasierte Video-Lernumgebung mit Lektionen, Fortschrittsstand und geraeteuebergreifender Speicherung.',
  },
  {
    id: 'chat-support',
    label: 'Chat Support',
    description: 'Direktnachrichten mit Tags (z. B. Methodik/Deadline); direkter Support.',
  },
  {
    id: 'schwaechen-analyse',
    label: 'Schwaechen-Analyse',
    description:
      'Kapitelgenaue Auswertung deiner Quizleistung; ab 50 beantworteten Fragen werden Schwaechen markiert und gezielte Schwaechen-Quiz erzeugt.',
  },
  {
    id: 'community',
    label: 'Community',
    description: 'Community-Bereich mit Leaderboard, Trends und Buddy-Matching (opt-in privacy-first).',
  },
  {
    id: 'elea-quality-score',
    label: 'Elea Quality Score',
    description: 'Qualitaetswert deiner Arbeit inkl. Rubrik (z. B. Struktur, Inhalt, Methodik) und klarer Entwicklungssicht.',
  },
  {
    id: 'panic-button',
    label: 'Panic Button',
    description: 'Soforthilfe-Flow mit 3 Kurzfragen, um in akuten Blockaden schnell Struktur und naechste Schritte auszuloesen.',
  },
  {
    id: 'betreuung-anna',
    label: '1:1 Betreuung mit Anna',
    description: 'Persoenliche Thesis-Termine mit Dr. Anna Horrer buchbar.',
  },
  {
    id: 'gruppen-calls',
    label: 'Gruppen Calls',
    description: 'Regelmaessige Live-Gruppen-Sessions plus direkter Call-Bereich in elea.',
  },
  {
    id: 'mock-defense',
    label: 'Mock Defense',
    description: 'Realistische Verteidigungssimulation als persoenliche Betreuungsleistung.',
  },
]
