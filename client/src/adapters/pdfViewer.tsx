// Adapter for the PDF viewer with citation highlighting.
// Swap this file to replace react-pdf-highlighter with another PDF viewing library.
import {
  PdfLoader,
  PdfHighlighter,
  Highlight,
  Popup,
} from "react-pdf-highlighter";
import type { IHighlight, ScaledPosition } from "react-pdf-highlighter";
import type { Citation, DocInfo } from "../types.ts";

// Re-export types so callers don't import directly from react-pdf-highlighter.
export type { IHighlight, ScaledPosition };

const WORKER_SRC = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

/** Convert a domain Citation to an IHighlight for react-pdf-highlighter. */
export function citationToHighlight(c: Citation, docs: DocInfo[]): IHighlight {
  const doc = docs.find((d) => d.id === c.docId);
  const dim = doc?.pageDims[c.page] ?? { w: 612, h: 792 };
  const rect = {
    x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2,
    width: dim.w, height: dim.h, pageNumber: c.page,
  };
  return {
    id: String(c.id),
    content: { text: c.quote || `Citation ${c.id}` },
    comment: { text: `[${c.id}]`, emoji: "📄" },
    position: {
      boundingRect: rect,
      rects: [rect],
      pageNumber: c.page,
      usePdfCoordinates: true,
    } as ScaledPosition,
  };
}

interface PdfViewerPaneProps {
  url: string;
  highlights: IHighlight[];
  activeCitationId?: string | null;
  onScrollRef: (scrollTo: (h: IHighlight) => void) => void;
}

/** Renders a PDF with citation highlights. Encapsulates all react-pdf-highlighter API surface. */
export function PdfViewerPane({ url, highlights, activeCitationId, onScrollRef }: PdfViewerPaneProps) {
  return (
    <PdfLoader url={url} workerSrc={WORKER_SRC} beforeLoad={<div className="pdf-loading">Loading…</div>}>
      {(pdfDocument) => (
        <PdfHighlighter
          pdfDocument={pdfDocument}
          highlights={highlights}
          onScrollChange={() => {}}
          scrollRef={onScrollRef}
          pdfScaleValue="page-width"
          onSelectionFinished={() => null}
          enableAreaSelection={() => false}
          highlightTransform={(highlight, _index, _setTip, _hideTip, _viewportToScaled, _screenshot, isScrolledTo) => (
            <Popup
              popupContent={<div className="highlight-popup">{highlight.comment.text}</div>}
              onMouseOver={() => {}}
              onMouseOut={() => {}}
              key={highlight.id}
            >
              <Highlight
                isScrolledTo={isScrolledTo || highlight.id === activeCitationId}
                position={highlight.position}
                comment={highlight.comment}
              />
            </Popup>
          )}
        />
      )}
    </PdfLoader>
  );
}
