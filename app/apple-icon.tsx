import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#3a6985",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
          color: "#faf9f6",
          fontSize: 72,
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        MT
      </div>
    ),
    {
      ...size,
    },
  );
}
