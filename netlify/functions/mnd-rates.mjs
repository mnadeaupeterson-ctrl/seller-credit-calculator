// Netlify Function: /.netlify/functions/mnd-rates  (add ?debug to inspect matching)
const URL_MND = "https://www.mortgagenewsdaily.com/mortgage-rates/mnd";

const LABELS = {
  fixed30: "30 Yr. Fixed",
  fixed15: "15 Yr. Fixed",
  fha: "30 Yr. FHA",
  va: "30 Yr. VA",
  jumbo: "30 Yr. Jumbo",
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export default async (req) => {
  const debug = new URL(req.url).searchParams.has("debug");
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const res = await fetch(URL_MND, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RateCalculator/1.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) throw new Error("MND responded " + res.status);
    const text = toText(await res.text());

    const rates = {};
    const context = {};
    for (const [key, label] of Object.entries(LABELS)) {
      // Case-sensitive on purpose: ignores the menu's "30 YR FHA"
      const m = new RegExp(esc(label) + "\\s+(\\d{1,2}(?:\\.\\d{1,3})?)\\s*%").exec(text);
      if (m) rates[key] = parseFloat(m[1]);
      const i = text.indexOf(label);
      context[key] = i < 0 ? "(label not found)" : text.slice(Math.max(0, i - 80), i + label.length + 120);
    }

    const d = /Last Updated:\s*(\d{1,2})\/(\d{1,2})\/(\d{2})/.exec(text);
    const date = d ? `${d[1]}/${d[2]}/${d[3]}` : null;
    const di = text.indexOf("Last Updated");
    context.date = di < 0 ? "(Last Updated not found)" : text.slice(Math.max(0, di - 40), di + 80);

    if (!Object.keys(rates).length) throw new Error("No rates matched");

    const body = { ok: true, source: "Mortgage News Daily", date, rates };
    if (debug) {
      body.context = context;
      body.textLength = text.length;
      return new Response(JSON.stringify(body, null, 2), { headers: { ...headers, "Cache-Control": "no-store" } });
    }
    return new Response(JSON.stringify(body), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), {
      status: 502,
      headers: { ...headers, "Cache-Control": "no-store" },
    });
  }
};
