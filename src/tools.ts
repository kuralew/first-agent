import type Anthropic from "@anthropic-ai/sdk";

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "extract_key_facts",
    description:
      "Call this after producing the document brief to save the structured key facts you have identified. " +
      "Always call this when one or more documents are analyzed — it enables downstream automation, export, and tracking. " +
      "Include citation tags exactly as they appear in the source text.",
    input_schema: {
      type: "object" as const,
      properties: {
        document_type: {
          type: "string",
          description: "Type of document(s), e.g. 'FTC Complaint', 'Employment Contract', 'Civil Complaint + Consent Order'",
        },
        parties: {
          type: "array",
          description: "All parties identified in the document(s)",
          items: {
            type: "object",
            properties: {
              role: { type: "string", description: "e.g. Plaintiff, Defendant, Respondent, Complainant" },
              name: { type: "string" },
              citation: { type: "string", description: "Citation tag from the source line" },
            },
            required: ["role", "name"],
          },
        },
        facts: {
          type: "array",
          description: "Key facts, claims, violations, obligations, or findings — each as a single sentence with its citation",
          items: {
            type: "object",
            properties: {
              category: {
                type: "string",
                description: "e.g. Violation, Claim, Obligation, Prohibition, Finding, Admission",
              },
              item: { type: "string", description: "The fact as a single sentence" },
              citation: { type: "string", description: "Citation tag(s) from the source" },
            },
            required: ["category", "item"],
          },
        },
        key_dates: {
          type: "array",
          description: "Significant dates mentioned in the document(s)",
          items: {
            type: "object",
            properties: {
              date: { type: "string" },
              description: { type: "string" },
              citation: { type: "string" },
            },
            required: ["date", "description"],
          },
        },
        amounts: {
          type: "array",
          description: "Monetary amounts, damages, fines, or penalties",
          items: {
            type: "object",
            properties: {
              amount: { type: "string" },
              description: { type: "string" },
              citation: { type: "string" },
            },
            required: ["amount", "description"],
          },
        },
      },
      required: ["document_type", "parties", "facts"],
    },
  },
  {
    name: "draft_document",
    description:
      "Call this after extract_key_facts to produce a draft legal document appropriate for the document type analyzed. " +
      "Choose the draft type based on what was uploaded: " +
      "complaint → draft a formal Response/Answer; " +
      "contract → draft an Obligations & Risk Summary memo; " +
      "consent order → draft a Compliance Action Plan; " +
      "deposition → draft a Key Testimony Summary; " +
      "regulatory filing → draft a Response memo; " +
      "multiple related documents → draft a Synthesis memo. " +
      "Write a complete, professional, ready-to-edit draft. Use markdown formatting (## headers, bullet lists).",
    input_schema: {
      type: "object" as const,
      properties: {
        draft_type: {
          type: "string",
          description: "e.g. 'Response to Complaint', 'Compliance Action Plan', 'Obligations & Risk Summary'",
        },
        title: {
          type: "string",
          description: "Full title of the draft document",
        },
        content: {
          type: "string",
          description: "Complete markdown content of the draft — headers, paragraphs, lists. Write a full, professional document.",
        },
      },
      required: ["draft_type", "title", "content"],
    },
  },
];

export function executeTool(
  name: string,
  input: Record<string, unknown>
): string {
  switch (name) {
    case "extract_key_facts":
      return `Extracted facts recorded: ${(input.facts as unknown[])?.length ?? 0} facts, ${(input.parties as unknown[])?.length ?? 0} parties.`;

    case "draft_document":
      return `Draft recorded: "${input.title}" (${input.draft_type}).`;

    default:
      return `Unknown tool: ${name}`;
  }
}
