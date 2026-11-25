import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // Qualités autorisées pour next/image (les photos des publications demandent 85)
  images: { qualities: [75, 85] },
  // Robots d'aperçu de liens qui reçoivent les métadonnées dans le <head> (au lieu de les recevoir en flux plus loin
  // dans la page). Ce réglage REMPLACE la liste par défaut de Next : on la reprend telle quelle (Next 16.4,
  // shared/lib/router/utils/html-bots) et on ajoute les applications qui manquaient (Snapchat, Telegram,
  // Pinterest, Viber, Bluesky, Mastodon, Teams / Outlook, Embedly, Iframely).
  htmlLimitedBots:
    /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Snap URL Preview|Snapchat|TelegramBot|Pinterest|Viber|Bluesky|Cardyb|Mastodon|MicrosoftPreview|Embedly|Iframely/i,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
