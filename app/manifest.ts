import type { MetadataRoute } from "next";
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "./brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: PRODUCT_NAME,
    short_name: PRODUCT_SHORT_NAME,
    description: "Хувийн Success Map, өдөр тутмын AI туслах, Academy болон багийн хэрэгжүүлэлтийн нэгдсэн систем.",
    start_url: "/",
    scope: "/",
    lang: "mn",
    display: "standalone",
    background_color: "#071426",
    theme_color: "#071426",
    orientation: "any",
    categories: ["education", "productivity"],
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      {
        name: "Миний Guide",
        short_name: "Guide",
        description: "Хувийн Success Map болон дараагийн алхмаа харах",
        url: "/my-guide",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "AI туслах",
        short_name: "AI туслах",
        description: "Хувийн дижитал ментортой ажиллах",
        url: "/assistant",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Video Academy",
        short_name: "Academy",
        description: "Видео хичээлээ үргэлжлүүлэх",
        url: "/academy",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
  };
}
