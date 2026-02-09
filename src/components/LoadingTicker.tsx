type LoadingTickerProps = {
  prefix?: string
  words?: string[]
  variant?: 'card' | 'inline'
  className?: string
}

const DEFAULT_WORDS = ['vernetzt', 'prüft', 'strukturiert', 'priorisiert', 'begleitet']

const normalizeWords = (words?: string[]) => {
  if (!words || words.length === 0) return DEFAULT_WORDS
  const next = [...words]
  while (next.length < 5) {
    next.push(DEFAULT_WORDS[next.length % DEFAULT_WORDS.length])
  }
  return next.slice(0, 5)
}

const LoadingTicker = ({
  prefix = 'elea',
  words,
  variant = 'card',
  className = '',
}: LoadingTickerProps) => {
  const items = normalizeWords(words)
  const classes = `elea-loading ${variant === 'inline' ? 'is-inline' : 'is-card'} ${className}`.trim()

  return (
    <div className={classes} role="status" aria-live="polite">
      <div className="elea-loading-line">
        <span className="elea-loading-prefix">{prefix}</span>
        <span className="elea-loading-words">
          {items.map((item, index) => (
            <span key={`${item}-${index}`} className="elea-loading-word">
              {item}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

export default LoadingTicker
