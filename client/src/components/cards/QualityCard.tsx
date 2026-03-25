import type { QualityResult } from "../../types.ts";

export function QualityCard({ result }: { result: QualityResult }) {
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: "Facts & citations",  ok: result.facts_adequate },
    { label: "Draft completeness", ok: result.draft_adequate },
    { label: "Risk citations",     ok: result.risks_adequate },
    { label: "Legal research",     ok: result.research_adequate },
  ];
  return (
    <div className={`quality-card ${result.overall_ready ? "quality-card--pass" : "quality-card--fail"}`}>
      <div className="quality-card-header">
        <span className="quality-card-icon">{result.overall_ready ? "✓" : "✗"}</span>
        <span className="quality-card-title">{result.overall_ready ? "Quality gate passed" : "Quality gaps found"}</span>
      </div>
      <div className="quality-checks">
        {checks.map((c) => (
          <span key={c.label} className={`quality-check ${c.ok ? "quality-check--ok" : "quality-check--fail"}`}>
            {c.ok ? "✓" : "✗"} {c.label}
          </span>
        ))}
      </div>
      {result.gaps.length > 0 && (
        <ul className="quality-gaps">
          {result.gaps.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      )}
    </div>
  );
}
