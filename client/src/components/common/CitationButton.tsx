import type { Citation } from "../../types.ts";
import { parseSingleTag } from "../../utils/citations.ts";

export function CitationButton({
  tag,
  id,
  onCitationClick,
}: {
  tag?: string;
  id: number;
  onCitationClick: (c: Citation) => void;
}) {
  const c = parseSingleTag(tag, id);
  if (!c) return null;
  return (
    <button
      className="citation-btn"
      onClick={() => onCitationClick(c)}
      title={`Jump to source — Doc ${c.docId}, page ${c.page}`}
    >
      ↗
    </button>
  );
}
