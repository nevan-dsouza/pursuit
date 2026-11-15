export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="Pursuit">
      <span className="brand-lines" aria-hidden />
      <span aria-hidden>
        Pursu
        <span className="brand-i">
          ı<i />
        </span>
        t
      </span>
    </button>
  )
}
