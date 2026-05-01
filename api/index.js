export const config = { runtime: "edge" };

// متغیر اصلی برای آدرس سرور مقصد
const REMOTE_ENDPOINT = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

// لیست هدرهایی که باید پاکسازی شوند
const HEADERS_BLACKLIST = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handler(req) {
  // بررسی تنظیمات اولیه
  if (!REMOTE_ENDPOINT) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    // یافتن موقعیت مسیر در درخواست
    const uriIdx = req.url.indexOf("/", 8);
    // ساخت آدرس نهایی
    const destination =
      uriIdx === -1 ? REMOTE_ENDPOINT + "/" : REMOTE_ENDPOINT + req.url.slice(uriIdx);

    // آماده‌سازی هدرهای ارسالی
    const forwardedHeaders = new Headers();
    let originIP = null;

    for (const [k, v] of req.headers) {
      if (HEADERS_BLACKLIST.has(k)) continue;
      if (k.startsWith("x-vercel-")) continue;
      
      if (k === "x-real-ip") {
        originIP = v;
        continue;
      }
      if (k === "x-forwarded-for") {
        if (!originIP) originIP = v;
        continue;
      }
      forwardedHeaders.set(k, v);
    }
    
    // ست کردن آی‌پی اصلی کاربر
    if (originIP) forwardedHeaders.set("x-forwarded-for", originIP);

    const method = req.method;
    // بررسی وجود بدنه در درخواست
    const isPayloadPresent = method !== "GET" && method !== "HEAD";

    // ارسال درخواست به سرور اصلی
    return await fetch(destination, {
      method,
      headers: forwardedHeaders,
      body: isPayloadPresent ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });
  } catch (err) {
    console.error("relay error:", err);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
