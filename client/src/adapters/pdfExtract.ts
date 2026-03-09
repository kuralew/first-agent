// Adapter for PDF text extraction. Swap this file to change the extraction library (currently pdfjs-dist).
export type { ExtractResult } from "../pdfExtract.ts";
export { extractTextWithBBoxes as extractPdfText } from "../pdfExtract.ts";
