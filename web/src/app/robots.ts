import type { MetadataRoute } from "next";

/**
 * AI training / AI-assistant crawlers asked not to crawl anything.
 * robots.txt is advisory: well-behaved crawlers honour it, others ignore it.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Meta-ExternalAgent",
  "meta-externalfetcher",
  "FacebookBot",
  "Amazonbot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "DuckAssistBot",
  "MistralAI-User",
  "YouBot",
  "AI2Bot",
  "Omgilibot",
  "ImagesiftBot",
  "Timpibot",
  "PetalBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: "/", disallow: ["/api/", "/models/"] },
    ],
  };
}
