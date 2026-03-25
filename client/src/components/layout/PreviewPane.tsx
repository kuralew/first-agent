import { PdfViewerPane } from "../../adapters/pdfViewer.tsx";
import type { IHighlight } from "../../adapters/pdfViewer.tsx";

export function PreviewPane({
  pdf,
  highlights,
  activeCitationId,
  paneRef,
  onScrollRef,
  onClose,
}: {
  pdf: { url: string; name: string };
  highlights: IHighlight[];
  activeCitationId: string | null;
  paneRef: React.RefObject<HTMLDivElement>;
  onScrollRef: (scrollTo: (h: IHighlight) => void) => void;
  onClose: () => void;
}) {
  return (
    <div className="preview-pane" ref={paneRef}>
      <div className="preview-header">
        <span className="preview-title">📄 {pdf.name}</span>
        <button
          className="preview-close"
          onClick={onClose}
          aria-label="Close preview"
        >
          ×
        </button>
      </div>
      <div className="preview-body">
        <PdfViewerPane
          url={pdf.url}
          highlights={highlights}
          activeCitationId={activeCitationId}
          onScrollRef={onScrollRef}
        />
      </div>
    </div>
  );
}
