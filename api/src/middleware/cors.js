/**
 * CORS middleware — allows the Hushwrite PWA to call the API.
 */
export function cors() {
  return async (c, next) => {
    // Handle preflight
    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    await next();

    // Add CORS headers to all responses
    const headers = corsHeaders();
    for (const [key, value] of Object.entries(headers)) {
      c.res.headers.set(key, value);
    }
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}
