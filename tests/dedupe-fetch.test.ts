import { describe, it, expect, vi, afterEach } from "vitest";
import { dedupeFetch } from "../lib/supabase/dedupeFetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(gate: Promise<void>) {
  const fetchMock = vi.fn(async () => {
    await gate;
    return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("dedupeFetch", () => {
  it("shares one request between identical GETs that are in flight", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const fetchMock = stubFetch(gate);

    const a = dedupeFetch("https://db.test/rest/v1/estimates?select=*", { headers: { authorization: "Bearer t" } });
    const b = dedupeFetch("https://db.test/rest/v1/estimates?select=*", { headers: { authorization: "Bearer t" } });
    open();
    const [ra, rb] = await Promise.all([a, b]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await ra.json()).toEqual([{ id: 1 }]);
    expect(await rb.json()).toEqual([{ id: 1 }]);
  });

  it("does not share requests for different URLs or users", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const fetchMock = stubFetch(gate);

    const a = dedupeFetch("https://db.test/rest/v1/estimates", { headers: { authorization: "Bearer one" } });
    const b = dedupeFetch("https://db.test/rest/v1/invoices", { headers: { authorization: "Bearer one" } });
    const c = dedupeFetch("https://db.test/rest/v1/estimates", { headers: { authorization: "Bearer two" } });
    open();
    await Promise.all([a, b, c]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never shares writes", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const fetchMock = stubFetch(gate);

    const a = dedupeFetch("https://db.test/rest/v1/estimates", { method: "PATCH" });
    const b = dedupeFetch("https://db.test/rest/v1/estimates", { method: "PATCH" });
    open();
    await Promise.all([a, b]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends a new request once the earlier one has finished", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await dedupeFetch("https://db.test/rest/v1/estimates");
    await dedupeFetch("https://db.test/rest/v1/estimates");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
