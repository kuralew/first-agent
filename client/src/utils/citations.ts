// Citation parsing utilities — shared across cards, hooks, and the PDF viewer adapter.
import type { Citation } from "../types.ts";

// Matches [d{docId}·p{page}·l{line}·bbox:{x1},{y1},{x2},{y2}]
export const CITATION_RE = /\[d(\d+)·p(\d+)·l(\d+)·bbox:(\d+),(\d+),(\d+),(\d+)\]/g;

// Phrases Claude sometimes emits before calling tools — strip them from display.
const PLANNING_PHRASES = [
  /^Now I['']ll call the required tools simultaneously\.?\n?/im,
  /^I['']ll now call\b[^\n]*\n?/im,
  /^Let me (now |)call\b[^\n]*\n?/im,
  /^I['']ll call\b[^\n]*\n?/im,
  /^Now(,| I['']ll)\b[^\n]*tools[^\n]*\n?/im,
];

export function stripPlanningPhrases(text: string): string {
  let out = text;
  for (const re of PLANNING_PHRASES) out = out.replace(re, "");
  return out;
}

/**
 * Strip citation tags from raw text and return clean text + citation list.
 *
 * Consecutive tags from the same doc+page with only whitespace between them
 * are treated as a range and merged into one citation whose bbox spans the
 * full passage.
 */
export function parseCitations(raw: string): { text: string; citations: Citation[] } {
  type TagMatch = {
    index: number; end: number;
    docId: number; page: number;
    x1: number; y1: number; x2: number; y2: number;
  };

  const tags: TagMatch[] = [];
  const re = new RegExp(CITATION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    tags.push({
      index: m.index, end: m.index + m[0].length,
      docId: +m[1], page: +m[2],
      x1: +m[4], y1: +m[5], x2: +m[6], y2: +m[7],
    });
  }

  // Group consecutive same-doc+page tags (only whitespace between) into ranges.
  const groups: TagMatch[][] = [];
  for (const tag of tags) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (
      prev &&
      prev.docId === tag.docId &&
      prev.page === tag.page &&
      /^\s*$/.test(raw.slice(prev.end, tag.index))
    ) {
      last.push(tag);
    } else {
      groups.push([tag]);
    }
  }

  // Merge each group into one citation with a bbox spanning the full passage.
  const citations: Citation[] = [];
  const replacements: { start: number; end: number; label: string }[] = [];
  let nextId = 1;

  for (const group of groups) {
    const docId = group[0].docId;
    const page = group[0].page;
    const x1 = Math.min(...group.map((t) => t.x1));
    const y1 = Math.min(...group.map((t) => t.y1));
    const x2 = Math.max(...group.map((t) => t.x2));
    const y2 = Math.max(...group.map((t) => t.y2));
    const existing = citations.find(
      (c) => c.docId === docId && c.page === page && c.x1 === x1 && c.y1 === y1
    );
    const id = existing ? existing.id : nextId;
    if (!existing) {
      citations.push({ id, docId, page, x1, y1, x2, y2, quote: "" });
      nextId++;
    }
    replacements.push({
      start: group[0].index,
      end: group[group.length - 1].end,
      label: "[" + id + "]",
    });
  }

  // Apply back-to-front so earlier indexes stay valid.
  let text = raw;
  for (const rep of [...replacements].reverse()) {
    text = text.slice(0, rep.start) + rep.label + text.slice(rep.end);
  }

  // Strip trailing incomplete citation tag that may appear during streaming.
  text = text.replace(/\[d?\d[^\]]*$/, "");

  return { text, citations };
}

/**
 * Parse a single raw citation tag string into a Citation for button rendering.
 * Handles full format [d1·p4·l26·bbox:x1,y1,x2,y2] and partial [d1·p4·l26].
 */
export function parseSingleTag(tag: string | undefined, fallbackId: number): Citation | null {
  if (!tag) return null;
  const full = tag.match(/\[d(\d+)·p(\d+)·l(\d+)·bbox:(\d+),(\d+),(\d+),(\d+)\]/);
  if (full) return { id: fallbackId, docId: +full[1], page: +full[2], x1: +full[4], y1: +full[5], x2: +full[6], y2: +full[7], quote: "" };
  const partial = tag.match(/\[d(\d+)·p(\d+)/);
  if (partial) return { id: fallbackId, docId: +partial[1], page: +partial[2], x1: 0, y1: 0, x2: 0, y2: 0, quote: "" };
  return null;
}
