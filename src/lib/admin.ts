const parseConfiguredAdminEmails = (): string[] => {
  const raw = import.meta.env.VITE_ADMIN_EMAILS ?? ''
  return raw
    .split(',')
    .map((value: string) => value.trim().toLowerCase())
    .filter(Boolean)
}

export const isAdminEmail = (email?: string | null): boolean => {
  if (!email) return false
  const normalized = email.toLowerCase()
  const configured = parseConfiguredAdminEmails()

  if (configured.length > 0) {
    return configured.includes(normalized)
  }

  // Dev fallback so local testing is possible before admin emails are configured.
  return import.meta.env.DEV
}

export const hasConfiguredAdminEmails = (): boolean => parseConfiguredAdminEmails().length > 0
