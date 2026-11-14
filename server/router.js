// Tiny router for our zero‑dependency Node server.
// Supports method + path matching with ":param" placeholders.
// Returns a handler function (req, res) => {...}

/**
 * Parse a route pattern like "/api/admin/subscribers/:id" into a regex and param names.
 */
function compileRoute(method, pattern, handler) {
  const paramNames = [];
  const regexStr = pattern
    .replace(/:[^/]+/g, (match) => {
      paramNames.push(match.substring(1));
      return '([^/]+)';
    })
    .replace(/\//g, '\\/');
  const regex = new RegExp(`^${regexStr}$`);
  return { method, regex, paramNames, handler };
}

export function createRouter() {
  const routes = [];
  return {
    add(method, pattern, handler) {
      routes.push(compileRoute(method.toUpperCase(), pattern, handler));
    },
    match(req) {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;
      const method = req.method?.toUpperCase();
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.regex.exec(pathname);
        if (m) {
          const params = {};
          r.paramNames.forEach((name, idx) => {
            params[name] = decodeURIComponent(m[idx + 1]);
          });
          return { handler: r.handler, params };
        }
      }
      return null;
    },
    // expose routes for testing
    _routes: routes,
  };
}
