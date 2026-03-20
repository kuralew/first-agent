// Adapter for legal web search — powered by Tavily (built for AI agents).
// API calls are limited: max 2 queries per search_legal call, 3 results each.

export interface SearchHit {
  title: string;
  url: string;
  description: string;
}

export interface SearchResult {
  query: string;
  hits: SearchHit[];
}

export async function performLegalSearch(queries: string[]): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return JSON.stringify({ error: "TAVILY_API_KEY not configured. Add it to your .env file." });
  }

  // Cap at 2 queries to conserve free-tier calls
  const capped = queries.slice(0, 2);
  const results: SearchResult[] = [];

  for (const query of capped) {
    try {
      const resp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: "basic",
          max_results: 3,
          include_answer: false,
        }),
      });

      if (!resp.ok) {
        console.warn(`[search] Tavily error ${resp.status} for query: ${query}`);
        results.push({ query, hits: [] });
        continue;
      }

      const data = await resp.json() as {
        results?: Array<{ title: string; url: string; content?: string }>;
      };

      const hits = (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        description: r.content ?? "",
      }));

      results.push({ query, hits });
      console.log(`  [search] "${query}" → ${hits.length} results`);
    } catch (err) {
      console.warn(`  [search] Failed for query "${query}":`, err);
      results.push({ query, hits: [] });
    }
  }

  return JSON.stringify(results, null, 2);
}
