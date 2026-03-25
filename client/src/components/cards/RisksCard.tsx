import { memo } from "react";
import type { DocumentRisks, Citation, RiskLevel } from "../../types.ts";
import { CitationButton } from "../common/CitationButton.tsx";
import { parseSingleTag } from "../../utils/citations.ts";

const LEVEL_COLOR: Record<RiskLevel, string> = {
  LOW:      "#2E7D32",
  MEDIUM:   "#E65100",
  HIGH:     "#B71C1C",
  CRITICAL: "#6A0000",
};

export const RisksCard = memo(function RisksCard({
  risks,
  onCitationClick,
}: {
  risks: DocumentRisks;
  onCitationClick: (c: Citation) => void;
}) {
  let citationCounter = 9000;

  const renderInlineText = (text: string | undefined) => {
    const parts = (text ?? "").split(/(\[d\d+·[^\]]+\])/g);
    return parts.map((part, i) => {
      if (/^\[d\d+·/.test(part)) {
        const c = parseSingleTag(part, citationCounter++);
        if (c) return <button key={i} className="citation-btn" onClick={() => onCitationClick(c)} title={`Jump to source — Doc ${c.docId}, page ${c.page}`}>↗</button>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="risks-card">
      <div className="risks-card-header">
        <div className="risks-card-title">
          <span className="risks-card-icon">⚠</span>
          <span>Risk Assessment</span>
          <span
            className="risks-overall-badge"
            style={{ background: LEVEL_COLOR[risks.overall_risk_level] }}
          >
            {risks.overall_risk_level}
          </span>
        </div>
      </div>

      <p className="risks-summary">{risks.summary}</p>

      <div className="risks-list">
        {risks.risks.map((r, i) => (
          <div key={i} className="risk-item" data-severity={r.severity}>
            <div className="risk-item-header">
              <span
                className="risk-severity"
                style={{ color: LEVEL_COLOR[r.severity] }}
              >
                {r.severity}
              </span>
              <span className="risk-category">{r.category}</span>
              <CitationButton tag={r.citation} id={citationCounter++} onCitationClick={onCitationClick} />
            </div>
            <p className="risk-description">{renderInlineText(r.description)}</p>
            <p className="risk-recommendation">
              <span className="risk-rec-label">Recommendation: </span>
              {renderInlineText(r.recommendation)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
});
