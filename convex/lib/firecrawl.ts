export type ExtractionResponse = {
  success: boolean;
  data?: {
    json?: Record<string, unknown>;
    markdown?: string;
    metadata?: {
      statusCode?: number;
      url?: string;
      ogImage?: unknown;
      favicon?: unknown;
    };
  };
};

export async function firecrawlRequest<T>(
  path: "/search" | "/scrape",
  body: Record<string, unknown>,
  timeoutMs = 95000,
): Promise<T> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) throw new Error("Firecrawl is not configured");
  const response = await fetch(`https://api.firecrawl.dev/v2${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Firecrawl request failed (HTTP ${response.status})`);
  return (await response.json()) as T;
}
