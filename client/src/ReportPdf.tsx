import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ExtractedFacts, DocumentRisks, DocumentDraft, LegalContext, RiskLevel } from "./types.ts";

// ── Styles ────────────────────────────────────────────────────────────────────

const C = {
  navy:    "#1B3A6B",
  slate:   "#374151",
  muted:   "#6B7280",
  border:  "#E5E7EB",
  pageBg:  "#FFFFFF",
  riskLow:      "#2E7D32",
  riskMedium:   "#E65100",
  riskHigh:     "#B71C1C",
  riskCritical: "#6A0000",
  purple:  "#6D28D9",
  purpleBg:"#EDE9FE",
  greenBg: "#D1FAE5",
  greenFg: "#065F46",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.slate,
    backgroundColor: C.pageBg,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
  },

  // ── Cover ──
  cover: { flex: 1, justifyContent: "center" },
  coverBrand: { flexDirection: "row", alignItems: "center", marginBottom: 36 },
  coverBrandBox: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.navy,
    alignItems: "center", justifyContent: "center",
    marginRight: 10,
  },
  coverBrandText: { color: "#fff", fontSize: 13, fontFamily: "Helvetica-Bold" },
  coverBrandName: { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.navy },
  coverRule: { borderBottom: `2 solid ${C.navy}`, marginBottom: 28 },
  coverTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.navy, marginBottom: 10 },
  coverMeta: { fontSize: 9, color: C.muted, marginBottom: 4 },
  coverBadge: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: C.navy,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  coverBadgeText: { color: "#fff", fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },

  // ── Page header / footer ──
  pageHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderBottom: `1 solid ${C.border}`, paddingBottom: 6, marginBottom: 20,
  },
  pageHeaderLeft: { fontSize: 8, color: C.navy, fontFamily: "Helvetica-Bold" },
  pageHeaderRight: { fontSize: 7, color: C.muted },
  pageFooter: {
    position: "absolute", bottom: 24, left: 48, right: 48,
    flexDirection: "row", justifyContent: "space-between",
    borderTop: `1 solid ${C.border}`, paddingTop: 5,
  },
  pageFooterText: { fontSize: 7, color: C.muted },

  // ── Section ──
  section: { marginBottom: 22 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    borderBottom: `1.5 solid ${C.navy}`, paddingBottom: 4, marginBottom: 10,
  },
  sectionIcon: { fontSize: 11, marginRight: 5 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.navy },
  sectionBadge: {
    marginLeft: 8, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2,
    fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.3,
  },

  // ── Table ──
  table: { borderRadius: 2 },
  tableRow: { flexDirection: "row", borderBottom: `1 solid ${C.border}` },
  tableRowAlt: { backgroundColor: "#F9FAFB" },
  tableHead: { backgroundColor: "#F3F4F6", borderBottom: `1.5 solid ${C.border}` },
  tableCell: { padding: "5 6", flex: 1, fontSize: 8.5 },
  tableCellBold: { fontFamily: "Helvetica-Bold", color: C.navy },
  tableCellMuted: { color: C.muted },

  // ── List ──
  listItem: { flexDirection: "row", marginBottom: 5 },
  bullet: { width: 10, color: C.navy, fontFamily: "Helvetica-Bold", fontSize: 9 },
  listText: { flex: 1, fontSize: 8.5, lineHeight: 1.5 },

  // ── Risk item ──
  riskItem: {
    borderRadius: 4, border: `1 solid ${C.border}`,
    marginBottom: 8, overflow: "hidden",
  },
  riskItemHeader: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#F9FAFB", padding: "5 8", borderBottom: `1 solid ${C.border}`,
  },
  riskSeverityBadge: {
    borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2,
    fontSize: 7, fontFamily: "Helvetica-Bold", marginRight: 7,
  },
  riskCategory: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.slate, flex: 1 },
  riskBody: { padding: "6 8" },
  riskLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.muted, marginBottom: 2 },
  riskText: { fontSize: 8.5, lineHeight: 1.5, color: C.slate, marginBottom: 6 },

  // ── Draft ──
  draftHeading1: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.navy, marginTop: 10, marginBottom: 4 },
  draftHeading2: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.navy, marginTop: 8, marginBottom: 3 },
  draftParagraph: { fontSize: 8.5, lineHeight: 1.6, marginBottom: 5, color: C.slate },
  draftBullet: { flexDirection: "row", marginBottom: 3 },
  draftApproved: {
    flexDirection: "row", alignItems: "center", marginBottom: 10,
    backgroundColor: C.greenBg, borderRadius: 4, padding: "5 8",
    border: `1 solid #6EE7B7`,
  },
  draftApprovedText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.greenFg },

  // ── Legal research ──
  findingItem: {
    borderRadius: 4, border: `1 solid #C4B5FD`,
    backgroundColor: "#F5F4FF", marginBottom: 8, padding: "7 9",
  },
  findingContext: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.purple, marginBottom: 3, letterSpacing: 0.4 },
  findingResearch: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.slate, marginBottom: 2 },
  findingImplication: { fontSize: 8.5, lineHeight: 1.5, color: C.slate },

  // ── Summary box ──
  summaryBox: {
    backgroundColor: "#F8F9FA", borderRadius: 4,
    border: `1 solid ${C.border}`, padding: "8 10", marginBottom: 12,
  },
  summaryText: { fontSize: 8.5, lineHeight: 1.6, color: C.slate },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(level: RiskLevel): string {
  return { LOW: C.riskLow, MEDIUM: C.riskMedium, HIGH: C.riskHigh, CRITICAL: C.riskCritical }[level];
}

/** Strip markdown syntax for plain-text PDF rendering. */
function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/~~(.+?)~~/g, "$1");
}

/** Parse draft markdown into renderable blocks. */
type DraftBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "bullet"; text: string }
  | { type: "p"; text: string };

function parseDraftBlocks(content: string): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  for (const line of content.split("\n")) {
    if (line.startsWith("### ")) blocks.push({ type: "h3", text: line.slice(4) });
    else if (line.startsWith("## ")) blocks.push({ type: "h2", text: line.slice(3) });
    else if (line.startsWith("# ")) blocks.push({ type: "h1", text: line.slice(2) });
    else if (line.startsWith("- ") || line.startsWith("* ")) blocks.push({ type: "bullet", text: stripMd(line.slice(2)) });
    else if (line.trim()) blocks.push({ type: "p", text: stripMd(line) });
  }
  return blocks;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageWrapper({
  caseName,
  pageLabel,
  children,
}: {
  caseName: string;
  pageLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.pageHeader} fixed>
        <Text style={s.pageHeaderLeft}>MLex · {caseName}</Text>
        <Text style={s.pageHeaderRight}>{pageLabel}</Text>
      </View>
      {children}
      <View style={s.pageFooter} fixed>
        <Text style={s.pageFooterText}>MLex — McDermott Will &amp; Schulte · Confidential</Text>
        <Text style={s.pageFooterText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

function SectionHeader({ icon, title, badge, badgeBg, badgeFg }: {
  icon: string; title: string; badge?: string; badgeBg?: string; badgeFg?: string;
}) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionIcon}>{icon}</Text>
      <Text style={s.sectionTitle}>{title}</Text>
      {badge && (
        <View style={[s.sectionBadge, { backgroundColor: badgeBg ?? C.navy }]}>
          <Text style={{ color: badgeFg ?? "#fff", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

// ── Main export component ─────────────────────────────────────────────────────

export interface ReportData {
  caseName: string;
  generatedAt: string;
  facts?: ExtractedFacts;
  draft?: DocumentDraft;
  draftApproved?: boolean;
  risks?: DocumentRisks;
  legalContext?: LegalContext;
}

export function ReportPdf({ data }: { data: ReportData }) {
  const { caseName, generatedAt, facts, draft, draftApproved, risks, legalContext } = data;

  return (
    <Document title={`MLex Report — ${caseName}`} author="MLex · McDermott Will & Schulte">
      {/* ── Cover page ── */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <View style={s.coverBrand}>
            <View style={s.coverBrandBox}>
              <Text style={s.coverBrandText}>ML</Text>
            </View>
            <Text style={s.coverBrandName}>MLex</Text>
          </View>
          <View style={s.coverRule} />
          <Text style={s.coverTitle}>{caseName}</Text>
          {facts?.document_type && (
            <Text style={s.coverMeta}>Document type: {facts.document_type}</Text>
          )}
          <Text style={s.coverMeta}>Generated: {generatedAt}</Text>
          {risks && (
            <View style={[s.coverBadge, { backgroundColor: riskColor(risks.overall_risk_level) }]}>
              <Text style={s.coverBadgeText}>Overall Risk: {risks.overall_risk_level}</Text>
            </View>
          )}
          <Text style={[s.coverMeta, { marginTop: 40, fontFamily: "Helvetica-Oblique" }]}>
            Confidential — Attorney Work Product
          </Text>
          <Text style={[s.coverMeta, { fontFamily: "Helvetica-Oblique" }]}>
            McDermott Will &amp; Schulte
          </Text>
        </View>
        <View style={s.pageFooter}>
          <Text style={s.pageFooterText}>MLex — Confidential</Text>
          <Text style={s.pageFooterText}>1</Text>
        </View>
      </Page>

      {/* ── Extracted Facts ── */}
      {facts && (
        <PageWrapper caseName={caseName} pageLabel="Extracted Facts">
          <View style={s.section}>
            <SectionHeader icon="⬡" title="Extracted Facts" badge={facts.document_type} />

            {/* Parties */}
            {facts.parties.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.riskLabel, { marginBottom: 4 }]}>PARTIES</Text>
                <View style={s.table}>
                  <View style={[s.tableRow, s.tableHead]}>
                    <Text style={[s.tableCell, s.tableCellBold, { flex: 0.6 }]}>Role</Text>
                    <Text style={[s.tableCell, s.tableCellBold]}>Name</Text>
                  </View>
                  {facts.parties.map((p, i) => (
                    <View key={i} style={[s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}>
                      <Text style={[s.tableCell, s.tableCellMuted, { flex: 0.6 }]}>{p.role}</Text>
                      <Text style={s.tableCell}>{p.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Facts by category */}
            {Object.entries(
              facts.facts.reduce<Record<string, typeof facts.facts>>((acc, f) => {
                (acc[f.category] = acc[f.category] ?? []).push(f);
                return acc;
              }, {})
            ).map(([category, items]) => (
              <View key={category} style={{ marginBottom: 10 }}>
                <Text style={[s.riskLabel, { marginBottom: 4 }]}>{category.toUpperCase()}</Text>
                {items.map((f, i) => (
                  <View key={i} style={s.listItem}>
                    <Text style={s.bullet}>•</Text>
                    <Text style={s.listText}>{f.item}</Text>
                  </View>
                ))}
              </View>
            ))}

            {/* Key Dates */}
            {facts.key_dates && facts.key_dates.length > 0 && (
              <View style={{ marginBottom: 10 }}>
                <Text style={[s.riskLabel, { marginBottom: 4 }]}>KEY DATES</Text>
                <View style={s.table}>
                  {facts.key_dates.map((d, i) => (
                    <View key={i} style={[s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}>
                      <Text style={[s.tableCell, s.tableCellBold, { flex: 0.5 }]}>{d.date}</Text>
                      <Text style={s.tableCell}>{d.description}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Amounts */}
            {facts.amounts && facts.amounts.length > 0 && (
              <View>
                <Text style={[s.riskLabel, { marginBottom: 4 }]}>AMOUNTS</Text>
                <View style={s.table}>
                  {facts.amounts.map((a, i) => (
                    <View key={i} style={[s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}>
                      <Text style={[s.tableCell, s.tableCellBold, { flex: 0.5 }]}>{a.amount}</Text>
                      <Text style={s.tableCell}>{a.description}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </PageWrapper>
      )}

      {/* ── Draft Document ── */}
      {draft && (
        <PageWrapper caseName={caseName} pageLabel="Draft Document">
          <View style={s.section}>
            <SectionHeader
              icon="✦"
              title={draft.draft_type}
              badge={draftApproved ? "✓ Approved" : undefined}
              badgeBg={C.greenBg}
              badgeFg={C.greenFg}
            />
            {draftApproved && (
              <View style={s.draftApproved}>
                <Text style={s.draftApprovedText}>✓ Approved for filing</Text>
              </View>
            )}
            <Text style={s.draftHeading1}>{draft.title}</Text>
            {parseDraftBlocks(draft.content).map((block, i) => {
              if (block.type === "h1") return <Text key={i} style={s.draftHeading1}>{block.text}</Text>;
              if (block.type === "h2") return <Text key={i} style={s.draftHeading2}>{block.text}</Text>;
              if (block.type === "h3") return <Text key={i} style={[s.draftHeading2, { fontSize: 9 }]}>{block.text}</Text>;
              if (block.type === "bullet") return (
                <View key={i} style={s.draftBullet}>
                  <Text style={s.bullet}>•</Text>
                  <Text style={s.listText}>{block.text}</Text>
                </View>
              );
              return <Text key={i} style={s.draftParagraph}>{block.text}</Text>;
            })}
          </View>
        </PageWrapper>
      )}

      {/* ── Risk Assessment ── */}
      {risks && (
        <PageWrapper caseName={caseName} pageLabel="Risk Assessment">
          <View style={s.section}>
            <SectionHeader
              icon="⚠"
              title="Risk Assessment"
              badge={risks.overall_risk_level}
              badgeBg={riskColor(risks.overall_risk_level)}
            />
            <View style={s.summaryBox}>
              <Text style={s.summaryText}>{risks.summary}</Text>
            </View>
            {risks.risks.map((r, i) => (
              <View key={i} style={s.riskItem}>
                <View style={s.riskItemHeader}>
                  <View style={[s.riskSeverityBadge, { backgroundColor: riskColor(r.severity) }]}>
                    <Text style={{ color: "#fff", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{r.severity}</Text>
                  </View>
                  <Text style={s.riskCategory}>{r.category}</Text>
                </View>
                <View style={s.riskBody}>
                  <Text style={s.riskLabel}>Description</Text>
                  <Text style={s.riskText}>{r.description}</Text>
                  <Text style={s.riskLabel}>Recommendation</Text>
                  <Text style={[s.riskText, { marginBottom: 0 }]}>{r.recommendation}</Text>
                </View>
              </View>
            ))}
          </View>
        </PageWrapper>
      )}

      {/* ── External Research ── */}
      {legalContext && (
        <PageWrapper caseName={caseName} pageLabel="External Research">
          <View style={s.section}>
            <SectionHeader icon="⚖" title="External Research" badge="Supplemental" badgeBg={C.purpleBg} badgeFg={C.purple} />
            <View style={s.summaryBox}>
              <Text style={s.summaryText}>{legalContext.summary}</Text>
            </View>
            {legalContext.findings.map((f, i) => (
              <View key={i} style={s.findingItem}>
                <Text style={s.findingContext}>{f.claim_context.toUpperCase()}</Text>
                <Text style={s.findingResearch}>{f.research}</Text>
                <Text style={s.findingImplication}>{f.implication}</Text>
              </View>
            ))}
          </View>
        </PageWrapper>
      )}
    </Document>
  );
}
