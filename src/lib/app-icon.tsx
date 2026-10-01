import { ImageResponse } from "next/og";

/** お椀と湯気のアプリアイコン。size は正方形の一辺 (px) */
export function renderAppIcon(size: number) {
  const u = size / 100;
  const steam = (left: number) => (
    <div
      style={{
        position: "absolute",
        left: left * u,
        top: 18 * u,
        width: 6 * u,
        height: 20 * u,
        borderRadius: 3 * u,
        background: "rgba(255,255,255,0.85)",
      }}
    />
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#d9603b",
        }}
      >
        {steam(36)}
        {steam(47)}
        {steam(58)}
        <div
          style={{
            position: "absolute",
            left: 20 * u,
            top: 46 * u,
            width: 60 * u,
            height: 32 * u,
            borderBottomLeftRadius: 30 * u,
            borderBottomRightRadius: 30 * u,
            background: "#fbf7f2",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 16 * u,
            top: 42 * u,
            width: 68 * u,
            height: 6 * u,
            borderRadius: 3 * u,
            background: "#fbf7f2",
          }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
