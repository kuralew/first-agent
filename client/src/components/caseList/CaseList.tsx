import { useCaseList } from "./useCaseList.ts";
import { formatDate } from "./CaseList.utils.ts";

interface CaseListProps {
  onSelectCase: (id: number) => void;
}

export default function CaseList({ onSelectCase }: CaseListProps) {
  const { filteredAndSortedCases, setSortField, setFilterPriority } = useCaseList();

  return (
    <div style={{ color: "#000042" }}>
      <div>
        <select onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="all">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select onChange={(e) => setSortField(e.target.value as "attorney" | "dueDate" | "priority")}>
          <option value="dueDate">Sort by Due Date</option>
          <option value="attorney">Sort by Attorney</option>
          <option value="priority">Sort by Priority</option>
        </select>
      </div>
      {filteredAndSortedCases.map((c) => (
        <div key={c.id}>
          <span style={{ color: "#000042" }}>{c.title}</span>
          <span>{c.attorney}</span>
          <span>{formatDate(c.dueDate)}</span>
          <span>{c.priority}</span>
          <a
            href={`/cases/${c.id}`}
            style={{ color: "#000042", textDecoration: "underline" }}
          >
            View Details
          </a>
          <button onClick={() => onSelectCase(c.id)}>
            Select Case
          </button>
        </div>
      ))}
      <a
        href="/cases/new"
        style={{
          color: "#000042",
          textDecoration: "none",
          textTransform: "uppercase",
          fontWeight: 500,
          fontSize: "16px",
          letterSpacing: "1.6px",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.color = "#0018F2";
          (e.target as HTMLElement).style.textDecoration = "underline";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.color = "#000042";
          (e.target as HTMLElement).style.textDecoration = "none";
        }}
      >
        + Add New Case
      </a>
    </div>
  );
}
