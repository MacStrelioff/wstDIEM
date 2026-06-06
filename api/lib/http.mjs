export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body;
}

export function requireMethod(req, allowed) {
  if (!allowed.includes(req.method)) {
    const err = new Error('method not allowed');
    err.status = 405;
    throw err;
  }
}

export function json(res, status, body) {
  res.status(status);
  res.setHeader?.('Content-Type', 'application/json');
  return res.json(body);
}

export function error(res, err) {
  const status = err.status || 500;
  return json(res, status, {
    error: err.message || 'internal error',
    ...(err.data ? { details: err.data } : {}),
  });
}
