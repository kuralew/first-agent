export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-logo">
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="40" cy="40" r="40" fill="#E8EDF5" />
          <text x="40" y="50" textAnchor="middle" fill="#1B3A6B" fontSize="22" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">ML</text>
        </svg>
      </div>
      <h2>How can I help you today?</h2>
      <p className="empty-subtitle">Your AI legal assistant by McDermott Will &amp; Schulte</p>
    </div>
  );
}
