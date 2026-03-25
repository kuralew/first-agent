export function PdfChips({
  pendingDocs,
  onRemove,
}: {
  pendingDocs: Array<{ name: string; url: string }>;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="pdf-chips">
      {pendingDocs.map((doc, i) => (
        <div key={i} className="pdf-chip">
          <span className="pdf-chip-icon">📄</span>
          <span className="pdf-chip-name">{doc.name}</span>
          <button
            className="pdf-chip-remove"
            onClick={() => onRemove(i)}
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
