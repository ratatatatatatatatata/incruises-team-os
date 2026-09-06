import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/account-deletion", "/legal/privacy", "/legal/terms"],
      disallow: "/",
    },
  };
}
