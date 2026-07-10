const ASSET_PATH = /\.(js|mjs|css|map|woff2?|ttf|eot|svg|png|jpe?g|gif|ico|webp|avif|wasm|json|txt|xml|webmanifest)$/i;
const SAFE_JS_CACHE = "public, max-age=3600, must-revalidate";

/**
 * SPA routing without serving index.html for missing hashed assets.
 * Prevents stale chunk requests from returning text/html (ChunkLoadError / MIME failures).
 */
export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const response = await next();

  if (path.startsWith("/api/")) {
    return response;
  }

  if (response.status === 404) {
    if (ASSET_PATH.test(path)) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    const indexResponse = await env.ASSETS.fetch(new URL("/", url.origin));
    return new Response(indexResponse.body, {
      status: 200,
      headers: indexResponse.headers,
    });
  }

  if (response.status === 200 && ASSET_PATH.test(path)) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }
  }

  if (/\.js$/i.test(path) && response.status === 200) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", SAFE_JS_CACHE);
    headers.delete("cdn-cache-control");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
}
