import { NextResponse } from "next/server";

// Client-side PDF generation (jsPDF) needs actual image bytes to embed a
// thumbnail — a plain URL won't do. Fetching a same-origin schema-assets
// URL works fine directly from the browser, but a Google Drive hotlink is
// cross-origin and can get silently blocked by CORS. Proxying it through
// our own server sidesteps that, since server-to-server fetches aren't
// subject to CORS at all.
const ALLOWED_PREFIXES = ["https://lh3.googleusercontent.com/"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url || !ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
