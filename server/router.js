// Tiny router for our zero-dependency Node server.
// Supports method + path matching with ":param" placeholders.
// Static routes (without params) win over param routes regardless of registration order.

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a route pattern like "/api/admin/subscribers/:id" into a regex and param names.
 */
function compileRoute(method, pattern, handler) {
  const paramNames = [];
  let regexStr = '^';
  let lastIdx = 0;
  const paramRe = /:([^/]+)/g;
  let m;

  while ((m = paramRe.exec(pattern)) !== null) {
    regexStr += escapeRegex(pattern.slice(lastIdx, m.index));
    paramNames.push(m[1]);
    regexStr += '([^/]+)';
    lastIdx = m.index + m[0].length;
  }
  regexStr += escapeRegex(pattern.slice(lastIdx)) + '$';

  const regex = new RegExp(regexStr);
  return {
    method: method.toUpperCase(),
    pattern,
    regex,
    paramNames,
    hasParams: paramNames.length > 0,
    handler,
  };
}

export function createRouter() {
  const routes = [];

  return {
    add(method, pattern, handler) {
      routes.push(compileRoute(method, pattern, handler));
    },

    match(req) {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;
      const method = req.method?.toUpperCase();

      // Static routes (no params) win over param routes regardless of registration order.
      const ordered = [
        ...routes.filter((r) => !r.hasParams),
        ...routes.filter((r) => r.hasParams),
      ];

      for (const r of ordered) {
        if (r.method !== method) continue;
        const m = r.regex.exec(pathname);
        if (!m) continue;

        const params = {};
        for (let idx = 0; idx < r.paramNames.length; idx++) {
          const name = r.paramNames[idx];
          try {
            params[name] = decodeURIComponent(m[idx + 1]);
          } catch {
            req.routeError = { status: 400, error: 'Malformed URL parameter' };
            return null;
          }
        }
        return { handler: r.handler, params };
      }

      return null;
    },

    // expose routes for testing
    _routes: routes,
  };
}
