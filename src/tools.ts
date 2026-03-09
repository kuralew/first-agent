import type Anthropic from "@anthropic-ai/sdk";

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "extract_key_facts",
    description:
      "Call this to save the structured key facts you have identified from a document. " +
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
      "Call this to produce a draft legal document appropriate for the document type analyzed. " +
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
  {
    name: "flag_risks",
    description:
      "Call this to identify legal risks in the analyzed document(s). " +
      "Surface missing clauses, ambiguous language, liability exposure, compliance gaps, and any red flags a lawyer should address. " +
      "Include citation tags pinpointing where each risk appears in the source.",
    input_schema: {
      type: "object" as const,
      properties: {
        overall_risk_level: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
          description: "Overall risk assessment for this document or set of documents",
        },
        risks: {
          type: "array",
          description: "Individual risks, ordered from highest to lowest severity",
          items: {
            type: "object",
            properties: {
              severity: {
                type: "string",
                enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
              },
              category: {
                type: "string",
                description: "e.g. 'Missing Clause', 'Ambiguous Language', 'Liability Exposure', 'Compliance Gap', 'Procedural Risk'",
              },
              description: {
                type: "string",
                description: "What the risk is and why it matters",
              },
              recommendation: {
                type: "string",
                description: "Specific action counsel should take to address it",
              },
              citation: {
                type: "string",
                description: "Citation tag from the source line where this risk appears",
              },
            },
            required: ["severity", "category", "description", "recommendation"],
          },
        },
        summary: {
          type: "string",
          description: "One-paragraph executive summary of the overall risk profile",
        },
      },
      required: ["overall_risk_level", "risks", "summary"],
    },
  },
  {
    name: "search_legal",
    description:
      "Call this to search for relevant legal precedents, statutes, and case law related to the risks and claims identified. " +
      "Derive 2–4 targeted search queries from the document's specific legal issues — use precise legal terminology. " +
      "The results are supplemental external context only — they never replace or modify the document-grounded analysis.",
    input_schema: {
      type: "object" as const,
      properties: {
        queries: {
          type: "array",
          description: "2–4 targeted legal search queries derived from the document's specific issues",
          items: { type: "string" },
          minItems: 1,
          maxItems: 4,
        },
        context: {
          type: "string",
          description: "Brief explanation of why these queries are relevant to the document analysis",
        },
      },
      required: ["queries", "context"],
    },
  },
  {
    name: "save_legal_context",
    description:
      "Call this after search_legal to save synthesized legal research findings. " +
      "Based on the search results, identify the most relevant precedents, statutes, and doctrines. " +
      "This is strictly external context — do not use it to allege facts or modify the document analysis. " +
      "Each finding must clearly state what it is and how it relates to the document's issues.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "One-paragraph overview of what the legal research revealed and its relevance",
        },
        findings: {
          type: "array",
          description: "Individual legal research findings — precedents, statutes, doctrines",
          items: {
            type: "object",
            properties: {
              claim_context: {
                type: "string",
                description: "The specific claim or risk from the document this finding relates to",
              },
              research: {
                type: "string",
                description: "The legal precedent, statute, or doctrine found (case name, citation, or statute reference)",
              },
              implication: {
                type: "string",
                description: "How this finding is relevant — what it means for counsel's strategy",
              },
              sources: {
                type: "array",
                description: "Source URLs from the search results",
                items: { type: "string" },
              },
            },
            required: ["claim_context", "research", "implication"],
          },
        },
      },
      required: ["summary", "findings"],
    },
  },
  {
    name: "assess_quality",
    description:
      "Call this after completing the main analysis chain (facts → draft → risks → research) to self-review quality. " +
      "Evaluate whether each completed section is thorough and accurate. " +
      "If gaps exist, you MUST re-run the deficient tool before calling assess_quality again. " +
      "Only mark overall_ready=true when ALL sections pass. This is your quality gate before responding to the user.",
    input_schema: {
      type: "object" as const,
      properties: {
        facts_adequate: {
          type: "boolean",
          description: "Are all key facts, parties, dates, and amounts captured with citations?",
        },
        draft_adequate: {
          type: "boolean",
          description: "Is the draft substantive, complete, and appropriate for the document type?",
        },
        risks_adequate: {
          type: "boolean",
          description: "Does every risk have a citation? Are the most serious risks captured?",
        },
        research_adequate: {
          type: "boolean",
          description: "Is the legal research relevant and properly synthesized?",
        },
        gaps: {
          type: "array",
          description: "Specific gaps or deficiencies found — empty if overall_ready is true",
          items: { type: "string" },
        },
        overall_ready: {
          type: "boolean",
          description: "True only when all sections pass. If false, you must re-run the deficient tools.",
        },
      },
      required: ["facts_adequate", "draft_adequate", "risks_adequate", "research_adequate", "gaps", "overall_ready"],
    },
  },
  {
    name: "request_clarification",
    description:
      "Call this when critical information is missing and proceeding would produce inaccurate or meaningless output. " +
      "Use sparingly — only for genuinely blocking gaps (e.g. unknown governing jurisdiction, missing exhibit referenced in the document, unclear scope of an engagement). " +
      "Do NOT use for information you can reasonably infer. " +
      "Set can_proceed=true if you can do a useful partial analysis while waiting. " +
      "Set can_proceed=false if the missing info makes any analysis pointless.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "The specific question to ask the user — clear and actionable",
        },
        reason: {
          type: "string",
          description: "Why this information is needed and what it will affect",
        },
        can_proceed: {
          type: "boolean",
          description: "Whether partial analysis can proceed while waiting for the answer",
        },
      },
      required: ["question", "reason", "can_proceed"],
    },
  },
];

async function performLegalSearch(queries: string[]): Promise<string> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return JSON.stringify({ error: "BRAVE_API_KEY not configured. Add it to your .env file." });
  }

  const results: Array<{ query: string; hits: Array<{ title: string; url: string; description: string }> }> = [];

  for (const query of queries) {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&result_filter=web`;
      const resp = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!resp.ok) {
        results.push({ query, hits: [] });
        continue;
      }

      const data = await resp.json() as {
        web?: { results?: Array<{ title: string; url: string; description?: string }> };
      };

      const hits = (data.web?.results ?? []).slice(0, 5).map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description ?? "",
      }));

      results.push({ query, hits });
    } catch {
      results.push({ query, hits: [] });
    }
  }

  return JSON.stringify(results, null, 2);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "extract_key_facts":
      return `Extracted facts recorded: ${(input.facts as unknown[])?.length ?? 0} facts, ${(input.parties as unknown[])?.length ?? 0} parties.`;

    case "draft_document":
      return `Draft recorded: "${input.title}" (${input.draft_type}).`;

    case "flag_risks":
      return `Risks recorded: ${(input.risks as unknown[])?.length ?? 0} risks flagged (overall: ${input.overall_risk_level}).`;

    case "search_legal": {
      const queries = input.queries as string[];
      console.log(`  [search_legal] Searching ${queries.length} queries via Brave…`);
      return await performLegalSearch(queries);
    }

    case "save_legal_context": {
      const findings = (input.findings as unknown[])?.length ?? 0;
      return `Legal context recorded: ${findings} findings.`;
    }

    case "assess_quality": {
      const gaps = input.gaps as string[];
      if (input.overall_ready) {
        return "Quality check passed. Analysis is complete and ready to present.";
      }
      return `Quality gaps found — do NOT respond yet. Re-run the deficient tools to fix these issues:\n${gaps.map((g) => `• ${g}`).join("\n")}`;
    }

    case "request_clarification":
      return `Clarification requested: "${input.question}". Pausing analysis until user responds.`;

    default:
      return `Unknown tool: ${name}`;
  }
}
