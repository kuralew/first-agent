// Adapter for PDF report generation. Swap this file to change the PDF rendering library (currently @react-pdf/renderer).
import type { ReportData } from "../ReportPdf.tsx";
export type { ReportData };

/**
 * Generate and download the full case analysis report as a PDF.
 * The heavy renderer is lazy-loaded so it doesn't affect initial bundle size.
 */
export async function generatePdfReport(data: ReportData, filename: string): Promise<void> {
  const [{ pdf }, { ReportPdf }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../ReportPdf.tsx"),
  ]);
  const blob = await pdf(<ReportPdf data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
