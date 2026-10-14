// Thin fetch wrapper for the FastAPI backend. Same-origin `/api`: Vite proxies it in development,
// Nginx and the Kubernetes Ingress route it in Docker and EKS.
export class ApiError extends Error {
  constructor(status, message, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields; // field name -> message, from FastAPI 422 responses
  }
}

function toError(status, data) {
  const detail = data?.detail;
  if (Array.isArray(detail)) {
    const fields = Object.fromEntries(detail.map((d) => [d.loc?.at(-1), d.msg.replace(/^Value error, /, "")]));
    return new ApiError(status, "Some fields need attention.", fields);
  }
  return new ApiError(status, typeof detail === "string" ? detail : `Request failed (${status}).`);
}

export async function api(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(0, "Can't reach the StockFlow server. Check that the backend is running, then try again.");
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw toError(response.status, data);
  return data;
}
