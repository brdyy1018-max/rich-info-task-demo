export function makePlaceholder(kind: "photo" | "video", caption: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const sky = kind === "video" ? "#1f2937" : "#c5ccd6";
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 720, 720);

  ctx.fillStyle = "#8b939e";
  ctx.fillRect(70, 250, 580, 400);

  ctx.fillStyle = "#e8edf3";
  ctx.fillRect(130, 300, 170, 130);
  ctx.fillRect(420, 300, 170, 130);

  ctx.fillStyle = "#111827";
  ctx.fillRect(310, 500, 100, 150);

  ctx.fillStyle = "#2f80ed";
  ctx.fillRect(160, 210, 400, 48);
  ctx.fillStyle = "#fff";
  ctx.font = "700 28px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(caption.slice(0, 22), 360, 244);

  if (kind === "video") {
    ctx.beginPath();
    ctx.arc(360, 430, 54, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(47,128,237,0.92)";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(342, 404);
    ctx.lineTo(342, 456);
    ctx.lineTo(392, 430);
    ctx.closePath();
    ctx.fill();
  }

  return canvas.toDataURL("image/jpeg", 0.74);
}

export const EXAMPLE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <rect fill="#d7dbe2" width="240" height="240"/>
    <rect fill="#9aa3af" x="18" y="78" width="204" height="144" rx="4"/>
    <rect fill="#cfd6de" x="36" y="98" width="70" height="52"/>
    <rect fill="#cfd6de" x="134" y="98" width="70" height="52"/>
    <rect fill="#4b5563" x="100" y="164" width="40" height="58"/>
    <rect fill="#2f80ed" x="48" y="52" width="144" height="22" rx="3"/>
  </svg>`,
);

export const EXAMPLE_URL = `data:image/svg+xml;charset=utf-8,${EXAMPLE_SVG}`;
