import { useUserDashboard } from "./useUserDashboard.ts";

export default function UserDashboardContainer() {
  const { documents, isLoading, searchTerm, handleSearch } = useUserDashboard();

  return (
    <div style={{ color: "#000042" }}>
      <h2>
        <a
          href="/help"
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
          Need Help?
        </a>
      </h2>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search documents"
      />
      {isLoading && <div>Loading...</div>}
      {documents.map((doc) => (
        <div key={doc.id}>
          <a
            href={`/documents/${doc.id}`}
            style={{ color: "#000042", textDecoration: "underline" }}
          >
            {doc.title}
          </a>
          <span>{doc.clientName}</span>
        </div>
      ))}
    </div>
  );
}
