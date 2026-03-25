import type { RoutingDecision } from "../../types.ts";

export function RoutingCard({ decision }: { decision: RoutingDecision }) {
  return (
    <div className="routing-card">
      <div className="routing-card-type">{decision.document_type}</div>
      <div className="routing-card-pills">
        <span className="routing-pill routing-pill--always">Analyst</span>
        {decision.run_researcher
          ? <span className="routing-pill routing-pill--on">Researcher</span>
          : <span className="routing-pill routing-pill--off">Researcher skipped</span>
        }
        <span className="routing-pill routing-pill--always">Drafter</span>
        <span className="routing-pill routing-pill--always">Quality</span>
      </div>
      {decision.researcher_focus && (
        <div className="routing-card-focus">Research focus: {decision.researcher_focus}</div>
      )}
      <div className="routing-card-rationale">{decision.rationale}</div>
    </div>
  );
}
