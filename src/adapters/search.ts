// Adapter for legal web search. Swap this file to change the search provider.

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
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return JSON.stringify({ error: "BRAVE_API_KEY not configured. Add it to your .env file." });
  }

  const results: SearchResult[] = [];

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
