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
];

export function executeTool(
  name: string,
  input: Record<string, unknown>
): string {
  switch (name) {
    case "extract_key_facts":
      // Echo the structured data back as confirmation.
      // The real value is the client capturing `input` from the tool event.
      return `Extracted facts recorded: ${(input.facts as unknown[])?.length ?? 0} facts, ${(input.parties as unknown[])?.length ?? 0} parties.`;

    default:
      return `Unknown tool: ${name}`;
  }
}
