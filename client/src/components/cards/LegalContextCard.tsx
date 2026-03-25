import { useState, memo } from "react";
import type { LegalContext } from "../../types.ts";

export const LegalContextCard = memo(function LegalContextCard({ context }: { context: LegalContext }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="legal-card">
      <div className="legal-card-header">
        <div className="legal-card-title">
          <span className="legal-card-icon">⚖</span>
          <span>External Research</span>
          <span className="legal-card-badge">Supplemental — not document-grounded</span>
        </div>
        <button
          className="legal-card-toggle"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <>
          <p className="legal-card-summary">{context.summary}</p>
          <div className="legal-findings">
            {context.findings.map((f, i) => (
              <div key={i} className="legal-finding">
                <div className="legal-finding-context">{f.claim_context}</div>
                <div className="legal-finding-research">{f.research}</div>
                <div className="legal-finding-implication">{f.implication}</div>
                {f.sources && f.sources.length > 0 && (
                  <div className="legal-finding-sources">
                    {f.sources.map((src, j) => (
                      <a key={j} href={src} target="_blank" rel="noopener noreferrer" className="legal-source-link">
                        {j + 1}. {src.replace(/^https?:\/\//, "").split("/")[0]}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
