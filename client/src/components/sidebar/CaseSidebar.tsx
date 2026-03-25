import type { CaseListItem } from "../../types.ts";

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function CaseSidebar({
  cases,
  activeCaseId,
  caseName,
  onLoad,
  onDelete,
  onNew,
  onRename,
}: {
  cases: CaseListItem[];
  activeCaseId: string | null;
  caseName: string;
  onLoad: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onNew: () => void;
  onRename: (name: string) => void;
}) {
  return (
    <div className="case-sidebar">
      <div className="case-sidebar-header">
        <span className="case-sidebar-title">Cases</span>
        <button className="case-new-btn" onClick={onNew} title="New case">＋</button>
      </div>

      {activeCaseId && (
        <div className="case-active-name">
          <input
            className="case-name-input"
            value={caseName}
            onChange={(e) => onRename(e.target.value)}
            placeholder="Name this case…"
          />
        </div>
      )}

      <div className="case-list">
        {cases.length === 0 ? (
          <div className="case-empty">No saved cases yet</div>
        ) : (
          cases.map((c) => (
            <div
              key={c.id}
              className={`case-item${c.id === activeCaseId ? " case-item-active" : ""}`}
              onClick={() => onLoad(c.id)}
            >
              <div className="case-item-name">{c.name}</div>
              <div className="case-item-meta">{formatRelativeDate(c.updatedAt)}</div>
              <button
                className="case-delete-btn"
                onClick={(e) => onDelete(c.id, e)}
                title="Delete case"
              >×</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
