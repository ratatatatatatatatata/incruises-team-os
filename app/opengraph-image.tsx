import { ImageResponse } from "next/og";
import { BRAND_NAME, PRODUCT_DESCRIPTOR, PRODUCT_NAME } from "./brand";

export const alt = `${PRODUCT_NAME} — сургалт, контент, гишүүний амжилтын нэгдсэн систем`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const squares = [
  { background: "#3194ff", width: 54, height: 54, borderRadius: 13 },
  { background: "#63cff7", width: 36, height: 36, borderRadius: 11 },
  { background: "#1667d9", width: 36, height: 36, borderRadius: 11 },
  { background: "#61afe9", width: 54, height: 54, borderRadius: 13 },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          background: "linear-gradient(135deg, #061326 0%, #092746 58%, #104a80 100%)",
          position: "relative",
          overflow: "hidden",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            opacity: 0.12,
            backgroundImage:
              "linear-gradient(#3ea4ff 1px, transparent 1px), linear-gradient(90deg, #3ea4ff 1px, transparent 1px)",
            backgroundSize: "74px 74px",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 42 }}>
          <div
            style={{
              width: 118,
              height: 118,
              display: "flex",
              flexWrap: "wrap",
              alignContent: "space-between",
              justifyContent: "space-between",
            }}
          >
            {squares.map((square, index) => (
              <div key={index} style={{ display: "flex", ...square }} />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 82, fontWeight: 800, letterSpacing: -3 }}>{BRAND_NAME}</div>
            <div style={{ display: "flex", color: "#67c8f6", fontSize: 25, fontWeight: 700, letterSpacing: 12, marginTop: 10 }}>
              {PRODUCT_DESCRIPTOR}
            </div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 52,
            display: "flex",
            fontSize: 22,
            color: "#b9cbe0",
            letterSpacing: 2,
          }}
        >
          СУРГАЛТ · КОНТЕНТ · ГИШҮҮНИЙ АМЖИЛТ
        </div>
      </div>
    ),
    size,
  );
}
