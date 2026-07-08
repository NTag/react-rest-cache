import { afterEach, describe, expect, it, vi } from "vitest";

import { RestCache } from "./restCache";
import { jsonResponse, stubFetch } from "./testUtils";

const noop = () => {};
const newSignal = () => new AbortController().signal;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RestCache fetchOptions", () => {
  it("sends headers returned by a headers function", async () => {
    const fetchMock = stubFetch().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const cache = RestCache({
      baseUrl: "https://api.test",
      fetchOptions: { headers: () => ({ Authorization: "Bearer token-1" }) },
    });

    await cache.query({ path: "/things", signal: newSignal() }, noop);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.test/things");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("sends plain object headers and other fetch options", async () => {
    const fetchMock = stubFetch().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const cache = RestCache({
      baseUrl: "https://api.test",
      fetchOptions: { headers: { "X-Custom": "yes" }, credentials: "include" },
    });

    await cache.query({ path: "/things", signal: newSignal() }, noop);

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers["X-Custom"]).toBe("yes");
    expect(init.credentials).toBe("include");
  });

  it("does not let fetchOptions override the per-request method, body and signal", async () => {
    const fetchMock = stubFetch().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const cache = RestCache({
      baseUrl: "https://api.test",
      fetchOptions: { method: "GET", cache: "no-store" },
    });

    const signal = newSignal();
    await cache.query({ path: "/things", method: "POST", body: { a: 1 }, signal }, noop);

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.signal).toBe(signal);
    expect(init.cache).toBe("no-store");
  });
});
