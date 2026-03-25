import type { ReportData } from "../../adapters/pdfReport.tsx";

export function AppHeader({
  sidebarOpen,
  onToggleSidebar,
  reportData,
  exporting,
  onExportReport,
  humanInTheLoop,
  onHumanInTheLoopChange,
  settingsOpen,
  onToggleSettings,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  reportData: ReportData | null;
  exporting: boolean;
  onExportReport: () => void;
  humanInTheLoop: boolean;
  onHumanInTheLoopChange: (value: boolean) => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
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
      <div className="header-actions">
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
        <div className="settings-anchor">
          <button
            className={`settings-btn${settingsOpen ? " settings-btn--active" : ""}`}
            onClick={onToggleSettings}
            title="Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {settingsOpen && (
            <div className="settings-panel">
              <div className="settings-panel-title">Settings</div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">Human-in-the-loop</div>
                  <div className="settings-item-desc">MLex asks one clarifying question before analysis begins</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={humanInTheLoop}
                    onChange={(e) => onHumanInTheLoopChange(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
