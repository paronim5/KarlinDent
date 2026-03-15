import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  addRequestInterceptor,
  addRequestTransform,
  addResponseErrorInterceptor,
  addResponseInterceptor,
  addResponseTransform,
  apiRequest,
  clearRequestCache,
  getLoadingState,
  resetAjaxClient,
  setConcurrencyLimit,
  subscribeLoadingState,
  useApi
} from "./client";

function createResponse({ status = 200, body = null, contentType = "application/json", statusText = "OK" } = {}) {
  const serializedBody = body === null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers({ "Content-Type": contentType }),
    text: vi.fn().mockResolvedValue(serializedBody)
  };
}

function deferredPromise() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("ajax client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.head.innerHTML = "";
    clearRequestCache();
    resetAjaxClient();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAjaxClient();
    clearRequestCache();
    localStorage.clear();
    document.head.innerHTML = "";
  });

  test("sends GET request with auth headers and parses JSON", async () => {
    localStorage.setItem("auth_user", JSON.stringify({ id: 7, role: "doctor" }));
    global.fetch.mockResolvedValue(createResponse({ body: [{ id: 1 }] }));
    const data = await apiRequest("/staff");
    expect(data).toEqual([{ id: 1 }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/staff");
    expect(options.headers.get("X-Staff-Id")).toBe("7");
    expect(options.headers.get("X-Staff-Role")).toBe("doctor");
    expect(options.headers.get("Accept")).toContain("application/json");
  });

  test("sends POST with JSON body and CSRF token", async () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "csrf-token");
    meta.setAttribute("content", "token-123");
    document.head.appendChild(meta);
    global.fetch.mockResolvedValue(createResponse({ status: 201, body: { id: 10 } }));
    const data = await apiRequest("/income", {
      method: "POST",
      body: { amount: 1000, note: "test" }
    });
    expect(data).toEqual({ id: 10 });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(options.headers.get("X-CSRF-Token")).toBe("token-123");
    expect(options.body).toBe(JSON.stringify({ amount: 1000, note: "test" }));
  });

  test("sends FormData without forcing JSON content type", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["x"], { type: "text/plain" }), "a.txt");
    global.fetch.mockResolvedValue(createResponse({ status: 200, body: { ok: true } }));
    await apiRequest("/documents", { method: "POST", body: formData });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.body).toBe(formData);
    expect(options.headers.get("Content-Type")).toBeNull();
  });

  test("creates user-friendly HTTP errors", async () => {
    global.fetch.mockResolvedValue(
      createResponse({
        status: 404,
        statusText: "Not Found",
        body: { error: "not_found" }
      })
    );
    await expect(apiRequest("/missing")).rejects.toMatchObject({
      name: "AjaxError",
      status: 404,
      userMessage: "The requested resource was not found."
    });
  });

  test("caches GET responses when enabled", async () => {
    global.fetch.mockResolvedValue(createResponse({ body: { list: [1, 2, 3] } }));
    const first = await apiRequest("/stats", { cache: true, cacheTTL: 1000 });
    const second = await apiRequest("/stats", { cache: true, cacheTTL: 1000 });
    expect(first).toEqual({ list: [1, 2, 3] });
    expect(second).toEqual({ list: [1, 2, 3] });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("retries failed requests and succeeds later", async () => {
    global.fetch
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(createResponse({ body: { ok: true } }));
    const result = await apiRequest("/retry", { retry: 1, retryDelay: 0 });
    expect(result).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("applies request and response pipelines", async () => {
    const stopRequestInterceptor = addRequestInterceptor((config) => {
      config.headers.set("X-Request-Id", "req-1");
      return config;
    });
    const stopRequestTransform = addRequestTransform((payload) => ({ ...payload, fromTransform: true }));
    const stopResponseTransform = addResponseTransform((payload) => ({ ...payload, transformed: true }));
    const stopResponseInterceptor = addResponseInterceptor((payload) => ({ ...payload, intercepted: true }));
    global.fetch.mockResolvedValue(createResponse({ body: { id: 5 } }));
    const result = await apiRequest("/pipeline", {
      method: "POST",
      body: { id: 5 }
    });
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ id: 5, fromTransform: true });
    expect(options.headers.get("X-Request-Id")).toBe("req-1");
    expect(result).toEqual({ id: 5, transformed: true, intercepted: true });
    stopRequestInterceptor();
    stopRequestTransform();
    stopResponseTransform();
    stopResponseInterceptor();
  });

  test("allows error interceptor to override error", async () => {
    const stopErrorInterceptor = addResponseErrorInterceptor(() => new Error("custom-message"));
    global.fetch.mockResolvedValue(createResponse({ status: 500, body: { error: "db_failed" } }));
    await expect(apiRequest("/failure")).rejects.toThrow("custom-message");
    stopErrorInterceptor();
  });

  test("queues requests and updates loading state", async () => {
    setConcurrencyLimit(1);
    const first = deferredPromise();
    const second = deferredPromise();
    global.fetch
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const updates = [];
    const unsubscribe = subscribeLoadingState((state) => {
      updates.push(state);
    });
    const firstRequest = apiRequest("/queue-a");
    const secondRequest = apiRequest("/queue-b");
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(getLoadingState()).toMatchObject({ active: 1, queued: 1, isLoading: true });
    first.resolve(createResponse({ body: { id: "a" } }));
    await firstRequest;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).toHaveBeenCalledTimes(2);
    second.resolve(createResponse({ body: { id: "b" } }));
    await secondRequest;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getLoadingState()).toMatchObject({ active: 0, queued: 0, isLoading: false });
    expect(updates.some((item) => item.active === 1 && item.queued === 1)).toBe(true);
    unsubscribe();
  });

  test("falls back to XMLHttpRequest when fetch is unavailable", async () => {
    const originalFetch = global.fetch;
    const originalXhr = global.XMLHttpRequest;
    global.fetch = undefined;
    class MockXHR {
      constructor() {
        this.headers = {};
        this.status = 200;
        this.statusText = "OK";
        this.responseText = JSON.stringify({ ok: true });
      }
      open(method, url) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(key, value) {
        this.headers[key] = value;
      }
      getAllResponseHeaders() {
        return "Content-Type: application/json";
      }
      send() {
        this.onload();
      }
    }
    global.XMLHttpRequest = MockXHR;
    const response = await apiRequest("/xhr");
    expect(response).toEqual({ ok: true });
    global.fetch = originalFetch;
    global.XMLHttpRequest = originalXhr;
  });

  test("returns timeout error in XMLHttpRequest mode", async () => {
    const originalXhr = global.XMLHttpRequest;
    class MockXHRTimeout {
      open() {}
      setRequestHeader() {}
      getAllResponseHeaders() {
        return "";
      }
      send() {
        this.ontimeout();
      }
    }
    global.XMLHttpRequest = MockXHRTimeout;
    global.fetch = vi.fn();
    await expect(apiRequest("/xhr-timeout", { forceXHR: true, timeout: 5 })).rejects.toMatchObject({
      name: "AjaxError",
      isTimeout: true
    });
    global.XMLHttpRequest = originalXhr;
  });

  test("exposes REST helper methods", async () => {
    global.fetch.mockResolvedValue(createResponse({ status: 204, body: "" }));
    const api = useApi();
    await api.get("/staff");
    await api.post("/staff", { first_name: "Ana" });
    await api.put("/staff/1", { first_name: "Vera" });
    await api.delete("/staff/1");
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(global.fetch.mock.calls[0][1].method).toBe("GET");
    expect(global.fetch.mock.calls[1][1].method).toBe("POST");
    expect(global.fetch.mock.calls[2][1].method).toBe("PUT");
    expect(global.fetch.mock.calls[3][1].method).toBe("DELETE");
  });
});
