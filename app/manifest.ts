import type { MetadataRoute } from "next";
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "./brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_SHORT_NAME,
    description: "Хувийн Success Map, өдөр тутмын AI туслах, Academy болон багийн хэрэгжүүлэлтийн нэгдсэн систем.",
    start_url: "/",
    display: "standalone",
    background_color: "#071426",
    theme_color: "#071426",
    orientation: "portrait-primary",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
