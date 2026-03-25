import { memo } from "react";
import type { ExtractedFacts, Citation } from "../../types.ts";
import { CitationButton } from "../common/CitationButton.tsx";
import { parseSingleTag } from "../../utils/citations.ts";

export const FactsCard = memo(function FactsCard({
  facts,
  onCitationClick,
}: {
  facts: ExtractedFacts;
  onCitationClick: (c: Citation) => void;
}) {
  let citationCounter = 5000;

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

  const byCategory = facts.facts.reduce<Record<string, typeof facts.facts>>((acc, f) => {
    (acc[f.category] = acc[f.category] ?? []).push(f);
    return acc;
  }, {});

  function exportJson() {
    const blob = new Blob([JSON.stringify(facts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "extracted-facts.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="facts-card">
      <div className="facts-card-header">
        <div className="facts-card-title">
          <span className="facts-card-icon">⬡</span>
          <span>Extracted Facts</span>
          <span className="facts-card-doctype">{facts.document_type}</span>
        </div>
        <button className="facts-export-btn" onClick={exportJson} title="Export as JSON">
          Export JSON
        </button>
      </div>

      {facts.parties.length > 0 && (
        <div className="facts-section">
          <div className="facts-section-label">Parties</div>
          <table className="facts-table">
            <tbody>
              {facts.parties.map((p, i) => (
                <tr key={i}>
                  <td className="facts-role">{p.role}</td>
                  <td className="facts-name">
                    {p.name}
                    <CitationButton tag={p.citation} id={citationCounter++} onCitationClick={onCitationClick} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {Object.entries(byCategory).map(([category, items]) => (
        <div className="facts-section" key={category}>
          <div className="facts-section-label">{category}</div>
          <ul className="facts-list">
            {items.map((f, i) => (
              <li key={i}>
                {renderInlineText(f.item)}
                <CitationButton tag={f.citation} id={citationCounter++} onCitationClick={onCitationClick} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {facts.key_dates && facts.key_dates.length > 0 && (
        <div className="facts-section">
          <div className="facts-section-label">Key Dates</div>
          <ul className="facts-list">
            {facts.key_dates.map((d, i) => (
              <li key={i}>
                <span className="facts-date">{d.date}</span>
                <span className="facts-date-desc">{renderInlineText(d.description)}</span>
                <CitationButton tag={d.citation} id={citationCounter++} onCitationClick={onCitationClick} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {facts.amounts && facts.amounts.length > 0 && (
        <div className="facts-section">
          <div className="facts-section-label">Amounts</div>
          <ul className="facts-list">
            {facts.amounts.map((a, i) => (
              <li key={i}>
                <span className="facts-amount">{a.amount}</span>
                <span className="facts-date-desc">{renderInlineText(a.description)}</span>
                <CitationButton tag={a.citation} id={citationCounter++} onCitationClick={onCitationClick} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
