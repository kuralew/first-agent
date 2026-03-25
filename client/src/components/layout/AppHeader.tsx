import type { ReportData } from "../../adapters/pdfReport.tsx";

export function AppHeader({
  sidebarOpen,
  onToggleSidebar,
  reportData,
  exporting,
  onExportReport,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  reportData: ReportData | null;
  exporting: boolean;
  onExportReport: () => void;
}) {
  return (
    <header className="header">
      <div className="header-inner">
        <button
          className="sidebar-toggle"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "Hide cases" : "Show cases"}
        >
          <svg viewBox="0 0 18 14" fill="none" width="18" height="14">
            <rect y="0" width="18" height="2" rx="1" fill="currentColor" />
            <rect y="6" width="12" height="2" rx="1" fill="currentColor" />
            <rect y="12" width="18" height="2" rx="1" fill="currentColor" />
          </svg>
        </button>
        <span className="header-logo">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
            <circle cx="12" cy="12" r="12" fill="#1B3A6B" />
            <text x="12" y="16" textAnchor="middle" fill="white" fontSize="7.5" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">ML</text>
          </svg>
        </span>
        <span className="header-title">MLex</span>
        <span className="header-model">McDermott Will &amp; Schulte</span>
      </div>
      {reportData && (
        <button
          className="export-report-btn"
          onClick={onExportReport}
          disabled={exporting}
          title="Export full analysis as PDF"
        >
          {exporting ? "Generating…" : "Export Report"}
        </button>
      )}
    </header>
  );
}
