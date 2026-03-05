import { getDocument } from "pdfjs-dist";
import type { PageDims } from "./types.ts";

export interface ExtractResult {
  text: string;
  pageDims: PageDims;
}

/**
 * Extract text lines with bounding boxes from a PDF File (runs in browser).
 * Coordinates are in PDF space (bottom-left origin) for use with usePdfCoordinates=true.
 * Emits tagged lines like:
 *   [p1·l3·bbox:72,700,540,712] The indemnification clause limits liability
 */
export async function extractTextWithBBoxes(file: File): Promise<ExtractResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const lines: string[] = [];
  const pageDims: PageDims = {};

  const Y_TOLERANCE = 4;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    pageDims[pageNum] = { w: Math.round(viewport.width), h: Math.round(viewport.height) };

    const content = await page.getTextContent();

    // Keep raw PDF coordinates (bottom-left origin).
    // transform = [scaleX, skewX, skewY, scaleY, x, y]
    // x = left edge, y = baseline (from bottom of page), h = font size
    const items: { x: number; y: number; w: number; h: number; text: string }[] = [];
    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue;
      const [, , , scaleY, x, y] = item.transform as number[];
      const h = Math.abs(scaleY);
      items.push({ x, y, w: item.width, h, text: item.str });
    }

    // Sort top→bottom (PDF: descending y), left→right
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    // Group into lines by Y proximity (PDF coords, so check descending y)
    const lineGroups: typeof items[] = [];
    for (const item of items) {
      const last = lineGroups[lineGroups.length - 1];
      if (last && Math.abs(item.y - last[0].y) <= Y_TOLERANCE) {
        last.push(item);
      } else {
        lineGroups.push([item]);
      }
    }

    for (let li = 0; li < lineGroups.length; li++) {
      const group = lineGroups[li];
      const text = group.map((i) => i.text).join(" ").trim();
      if (!text) continue;
      const x1 = Math.round(Math.min(...group.map((i) => i.x)));
      // y = baseline; bottom = baseline, top = baseline + font height
      const y1 = Math.round(Math.min(...group.map((i) => i.y)));           // bottom (PDF)
      const x2 = Math.round(Math.max(...group.map((i) => i.x + i.w)));
      const y2 = Math.round(Math.max(...group.map((i) => i.y + i.h)));     // top (PDF)
      lines.push(`[p${pageNum}·l${li}·bbox:${x1},${y1},${x2},${y2}] ${text}`);
    }
  }

  return { text: lines.join("\n"), pageDims };
}
