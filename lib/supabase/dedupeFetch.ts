/**
 * A fetch that shares identical GET requests which are still in flight.
 *
 * Several services load the same tables when a page opens, and they all start
 * at once. Without this, each one makes its own request for the same data.
 * Here, the second and later callers get the first request's response.
 *
 * Only requests that have not finished yet are shared, so a read made after
 * a write still gets fresh data. Non-GET requests always go straight to
 * fetch. Every caller gets its own copy of the response body.
 */
const inFlight = new Map<string, Promise<Response>>();

export function dedupeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  if (method !== "GET") return fetch(input, init);

  const url = request ? request.url : input instanceof URL ? input.href : String(input);
  const headers = new Headers(init?.headers ?? request?.headers);
  const key = `${headers.get("authorization") ?? ""} ${url}`;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetch(input, init);
    inFlight.set(key, pending);
    const done = () => inFlight.delete(key);
    pending.then(done, done);
  }
  return pending.then((response) => response.clone());
}
