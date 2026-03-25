import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocumentDraft, DraftReview } from "../../types.ts";

export const DraftCard = memo(function DraftCard({
  draft,
  review,
  onApprove,
  onReject,
}: {
  draft: DocumentDraft;
  review?: DraftReview;
  onApprove?: () => void;
  onReject?: (comment: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  async function downloadDocx() {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

    const children: InstanceType<typeof Paragraph>[] = [];
    children.push(new Paragraph({ text: draft.title, heading: HeadingLevel.TITLE }));

    for (const line of draft.content.split("\n")) {
      if (line.startsWith("## ")) {
        children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
      } else if (line.startsWith("# ")) {
        children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        children.push(new Paragraph({ text: line.slice(2), bullet: { level: 0 } }));
      } else if (line.trim() === "") {
        children.push(new Paragraph({ text: "" }));
      } else {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const runs = parts.map((p) => {
          if (p.startsWith("**") && p.endsWith("**")) {
            return new TextRun({ text: p.slice(2, -2), bold: true });
          }
          return new TextRun({ text: p });
        });
        children.push(new Paragraph({ children: runs }));
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function submitReject() {
    if (!rejectComment.trim()) return;
    onReject?.(rejectComment.trim());
    setRejecting(false);
    setRejectComment("");
  }

  const reviewed = review && review.status !== "pending";

  return (
    <div className={`draft-card${reviewed ? ` draft-card-${review!.status}` : ""}`}>
      <div className="draft-card-header">
        <div className="draft-card-title">
          <span className="draft-card-icon">✦</span>
          <span className="draft-card-type">{draft.draft_type}</span>
          <span className="draft-card-name">{draft.title}</span>
          {review?.status === "approved" && (
            <span className="draft-review-badge draft-review-badge-approved">✓ Approved</span>
          )}
          {review?.status === "rejected" && (
            <span className="draft-review-badge draft-review-badge-rejected">↩ Revision Requested</span>
          )}
        </div>
        <div className="draft-card-actions">
          <button className="draft-download-btn" onClick={downloadDocx} title="Download as .docx">
            Download .docx
          </button>
          <button
            className="draft-toggle-btn"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="draft-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.content}</ReactMarkdown>
        </div>
      )}

      {!reviewed && onApprove && onReject && (
        <div className="draft-review-bar">
          {!rejecting ? (
            <>
              <button className="draft-approve-btn" onClick={onApprove}>
                ✓ Approve
              </button>
              <button className="draft-reject-btn" onClick={() => setRejecting(true)}>
                ↩ Request Revision
              </button>
            </>
          ) : (
            <div className="draft-reject-form">
              <textarea
                className="draft-reject-textarea"
                placeholder="Describe what needs to change…"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReject();
                  if (e.key === "Escape") { setRejecting(false); setRejectComment(""); }
                }}
              />
              <div className="draft-reject-actions">
                <button
                  className="draft-reject-submit-btn"
                  onClick={submitReject}
                  disabled={!rejectComment.trim()}
                >
                  Send Feedback
                </button>
                <button
                  className="draft-reject-cancel-btn"
                  onClick={() => { setRejecting(false); setRejectComment(""); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {review?.status === "rejected" && review.comment && (
        <div className="draft-review-comment">
          <span className="draft-review-comment-label">Feedback sent:</span>
          {review.comment}
        </div>
      )}
    </div>
  );
});
