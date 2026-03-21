const API_BASE = "/api";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const DEFAULT_CACHE_TTL_MS = 30000;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CACHEABLE_METHODS = new Set(["GET"]);

const loadingListeners = new Set();
const requestInterceptors = [];
const responseInterceptors = [];
const responseErrorInterceptors = [];
const requestTransforms = [];
const responseTransforms = [];
const requestCache = new Map();

let maxConcurrentRequests = 4;
let activeRequestCount = 0;
let queuedRequestCount = 0;
const pendingQueue = [];

function notifyLoadingState() {
  const state = getLoadingState();
  loadingListeners.forEach((listener) => listener(state));
}

function queueTask(task) {
  return new Promise((resolve, reject) => {
    pendingQueue.push({ task, resolve, reject });
    queuedRequestCount += 1;
    notifyLoadingState();
    drainQueue();
  });
}

function drainQueue() {
  while (activeRequestCount < maxConcurrentRequests && pendingQueue.length > 0) {
    const item = pendingQueue.shift();
    queuedRequestCount = Math.max(0, queuedRequestCount - 1);
    activeRequestCount += 1;
    notifyLoadingState();
    item.task()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        activeRequestCount = Math.max(0, activeRequestCount - 1);
        notifyLoadingState();
        drainQueue();
      });
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(url);
}

function toUserFriendlyMessage(status, fallback) {
  if (status === 400) return "The request is invalid. Please review the entered data.";
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested resource was not found.";
  if (status === 408) return "The request timed out. Please try again.";
  if (status === 409) return "The data was changed by another request. Refresh and try again.";
  if (status === 422) return "Some fields contain invalid values. Please correct them.";
  if (status >= 500) return "The server is currently unavailable. Please try again later.";
  return fallback || "The request could not be completed.";
}

function buildUrl(path, baseUrl, params) {
  const root = baseUrl || API_BASE;
  const pathUrl = isAbsoluteUrl(path) ? path : `${root}${path}`;
  if (!params || Object.keys(params).length === 0) {
    return pathUrl;
  }
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, String(entry)));
      return;
    }
    if (value === null || value === undefined) {
      return;
    }
    query.append(key, String(value));
  });
  const queryString = query.toString();
  if (!queryString) {
    return pathUrl;
  }
  return pathUrl.includes("?") ? `${pathUrl}&${queryString}` : `${pathUrl}?${queryString}`;
}

function getCacheKey(method, url, headers) {
  const relevantHeaders = new Headers(headers);
  return JSON.stringify({
    method,
    url,
    accept: relevantHeaders.get("Accept"),
    role: relevantHeaders.get("X-Staff-Role"),
    staffId: relevantHeaders.get("X-Staff-Id")
  });
}

function getCsrfTokenFromDom() {
  if (typeof document === "undefined") {
    return "";
  }
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute("content") || "";
}

function getAuthHeaders() {
  const headers = new Headers();
  try {
    const rawUser = localStorage.getItem("auth_user");
    if (!rawUser) {
      return headers;
    }
    const user = JSON.parse(rawUser);
    if (user?.id) {
      headers.set("X-Staff-Id", String(user.id));
    }
    if (user?.role) {
      headers.set("X-Staff-Role", String(user.role));
    }
  } catch {
  }
  return headers;
}

function normalizeRequestInput(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  const authHeaders = getAuthHeaders();
  authHeaders.forEach((value, key) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json, text/plain, */*");
  }
  if (UNSAFE_METHODS.has(method) && !options.skipCsrf) {
    const csrfToken = options.csrfToken || getCsrfTokenFromDom();
    if (csrfToken && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }
  const timeout = Number(options.timeout ?? DEFAULT_TIMEOUT_MS);
  const retry = Number(options.retry ?? DEFAULT_RETRY_COUNT);
  const retryDelay = Number(options.retryDelay ?? DEFAULT_RETRY_DELAY_MS);
  const cache = Boolean(options.cache);
  const cacheTTL = Number(options.cacheTTL ?? DEFAULT_CACHE_TTL_MS);
  const shouldUseCache = cache && CACHEABLE_METHODS.has(method);
  const withCredentials = Boolean(options.withCredentials);
  const transformRequestPipeline = [...requestTransforms, ...(options.transformRequest || [])];
  const transformResponsePipeline = [...responseTransforms, ...(options.transformResponse || [])];
  return {
    ...options,
    path,
    method,
    headers,
    timeout,
    retry,
    retryDelay,
    cacheTTL,
    shouldUseCache,
    withCredentials,
    transformRequestPipeline,
    transformResponsePipeline,
    url: buildUrl(path, options.baseUrl, options.params)
  };
}

function prepareBody(config) {
  const method = config.method;
  if (method === "GET" || method === "HEAD") {
    return undefined;
  }
  if (config.body === undefined || config.body === null) {
    return undefined;
  }
  let payload = config.body;
  config.transformRequestPipeline.forEach((transformer) => {
    payload = transformer(payload, config);
  });
  if (payload instanceof FormData) {
    return payload;
  }
  if (payload instanceof URLSearchParams) {
    if (!config.headers.has("Content-Type")) {
      config.headers.set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    }
    return payload.toString();
  }
  if (isPlainObject(payload) || Array.isArray(payload)) {
    if (!config.headers.has("Content-Type")) {
      config.headers.set("Content-Type", "application/json");
    }
    const contentType = config.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      return JSON.stringify(payload);
    }
  }
  return payload;
}

async function parseResponseBody(responseLike) {
  const contentType = responseLike.headers?.get?.("Content-Type") || "";
  if (responseLike.status === 204 || responseLike.status === 205) {
    return null;
  }
  const text = await responseLike.text();
  if (!text) {
    return null;
  }
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function createAjaxError(message, details = {}) {
  const error = new Error(message);
  error.name = "AjaxError";
  error.status = details.status ?? 0;
  error.statusText = details.statusText || "";
  error.code = details.code || "";
  error.isNetworkError = Boolean(details.isNetworkError);
  error.isTimeout = Boolean(details.isTimeout);
  error.method = details.method || "";
  error.url = details.url || "";
  error.responseData = details.responseData ?? null;
  error.userMessage = details.userMessage || message;
  return error;
}

async function fetchRequest(config, requestBody) {
  const canAbort = typeof AbortController !== "undefined";
  const controller = canAbort ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    if (controller) {
      controller.abort();
    }
  }, config.timeout);
  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: requestBody,
      signal: controller?.signal,
      credentials: config.withCredentials ? "include" : "same-origin"
    });
    const body = await parseResponseBody(response);
    if (!response.ok) {
      const rawMessage = body?.error || body?.message || response.statusText || "Request failed";
      throw createAjaxError(rawMessage, {
        status: response.status,
        statusText: response.statusText,
        method: config.method,
        url: config.url,
        responseData: body,
        userMessage: toUserFriendlyMessage(response.status, rawMessage)
      });
    }
    return body;
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    if (error?.name === "AjaxError") {
      throw error;
    }
    throw createAjaxError(isTimeout ? "Request timeout" : error?.message || "Network request failed", {
      code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
      isTimeout,
      isNetworkError: !isTimeout,
      method: config.method,
      url: config.url,
      userMessage: isTimeout
        ? toUserFriendlyMessage(408, "Request timeout")
        : "Network connection error. Please check your internet and try again."
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function xhrRequest(config, requestBody) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(config.method, config.url, true);
    if (config.withCredentials) {
      xhr.withCredentials = true;
    }
    xhr.timeout = config.timeout;
    config.headers.forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.onload = async () => {
      const headers = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders().trim().split(/[\r\n]+/);
      rawHeaders.forEach((line) => {
        if (!line) return;
        const [name, ...rest] = line.split(": ");
        headers.append(name, rest.join(": "));
      });
      const responseLike = {
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText,
        headers,
        text: async () => xhr.responseText
      };
      const body = await parseResponseBody(responseLike);
      if (!responseLike.ok) {
        const rawMessage = body?.error || body?.message || responseLike.statusText || "Request failed";
        reject(
          createAjaxError(rawMessage, {
            status: responseLike.status,
            statusText: responseLike.statusText,
            method: config.method,
            url: config.url,
            responseData: body,
            userMessage: toUserFriendlyMessage(responseLike.status, rawMessage)
          })
        );
        return;
      }
      resolve(body);
    };
    xhr.onerror = () => {
      reject(
        createAjaxError("Network request failed", {
          code: "NETWORK_ERROR",
          isNetworkError: true,
          method: config.method,
          url: config.url,
          userMessage: "Network connection error. Please check your internet and try again."
        })
      );
    };
    xhr.ontimeout = () => {
      reject(
        createAjaxError("Request timeout", {
          code: "TIMEOUT",
          isTimeout: true,
          method: config.method,
          url: config.url,
          userMessage: toUserFriendlyMessage(408, "Request timeout")
        })
      );
    };
    xhr.send(requestBody);
  });
}

function shouldRetryRequest(error, config, attempt) {
  if (attempt >= config.retry) {
    return false;
  }
  if (error?.isTimeout || error?.isNetworkError) {
    return true;
  }
  if (!Number.isFinite(error?.status)) {
    return false;
  }
  if (error.status === 429) {
    return true;
  }
  const retriableMethod = ["GET", "PUT", "DELETE", "HEAD", "OPTIONS"].includes(config.method);
  return retriableMethod && error.status >= 500;
}

async function executeWithRetry(config, operation) {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!shouldRetryRequest(error, config, attempt)) {
        throw error;
      }
      const delayMs = config.retryDelay * Math.pow(2, attempt);
      await delay(delayMs);
      attempt += 1;
    }
  }
}

async function applyRequestInterceptors(config) {
  let nextConfig = config;
  for (const interceptor of requestInterceptors) {
    nextConfig = await interceptor(nextConfig);
  }
  return nextConfig;
}

async function applyResponseInterceptors(data, config) {
  let transformedData = data;
  for (const transformer of config.transformResponsePipeline) {
    transformedData = transformer(transformedData, config);
  }
  for (const interceptor of responseInterceptors) {
    transformedData = await interceptor(transformedData, config);
  }
  return transformedData;
}

async function applyErrorInterceptors(error, config) {
  let nextError = error;
  for (const interceptor of responseErrorInterceptors) {
    const maybeError = await interceptor(nextError, config);
    if (maybeError instanceof Error) {
      nextError = maybeError;
    }
  }
  throw nextError;
}

async function executeRequest(path, options = {}) {
  const initialConfig = normalizeRequestInput(path, options);
  const config = await applyRequestInterceptors(initialConfig);
  const cacheKey = config.shouldUseCache ? getCacheKey(config.method, config.url, config.headers) : "";
  if (cacheKey && requestCache.has(cacheKey)) {
    const cached = requestCache.get(cacheKey);
    if (cached.expiresAt > Date.now()) {
      return cached.value;
    }
    requestCache.delete(cacheKey);
  }
  const requestBody = prepareBody(config);
  const executeTransport = () => {
    if (typeof fetch === "function" && !config.forceXHR) {
      return fetchRequest(config, requestBody);
    }
    return xhrRequest(config, requestBody);
  };
  try {
    const rawData = await executeWithRetry(config, executeTransport);
    const data = await applyResponseInterceptors(rawData, config);
    if (cacheKey) {
      requestCache.set(cacheKey, {
        value: data,
        expiresAt: Date.now() + config.cacheTTL
      });
    }
    return data;
  } catch (error) {
    return applyErrorInterceptors(error, config);
  }
}

/**
 * Sends an AJAX request and returns parsed response data.
 * @param {string} path REST endpoint path (for example: "/staff").
 * @param {object} [options] Request options.
 * @param {"GET"|"POST"|"PUT"|"DELETE"|"PATCH"} [options.method="GET"] HTTP method.
 * @param {object|FormData|URLSearchParams|string} [options.body] Request payload.
 * @param {object} [options.params] Query params object.
 * @param {HeadersInit} [options.headers] Request headers.
 * @param {number} [options.timeout=15000] Timeout in milliseconds.
 * @param {number} [options.retry=2] Retry count for eligible failures.
 * @param {number} [options.retryDelay=300] Initial retry delay in milliseconds.
 * @param {boolean} [options.cache=false] Enables GET response caching.
 * @param {number} [options.cacheTTL=30000] Cache TTL in milliseconds.
 * @param {boolean} [options.withCredentials=false] Sends cookies for cross-origin requests.
 * @param {boolean} [options.skipCsrf=false] Skips CSRF header for unsafe requests.
 * @param {string} [options.csrfToken] Explicit CSRF token value.
 * @param {Array<(data:any, config:object)=>any>} [options.transformRequest] Per-request body transformers.
 * @param {Array<(data:any, config:object)=>any>} [options.transformResponse] Per-request response transformers.
 * @returns {Promise<any>} Parsed server response.
 * @example
 * await apiRequest("/staff", { method: "GET", cache: true });
 * @example
 * await apiRequest("/income", { method: "POST", body: { amount: 1000 } });
 */
export async function apiRequest(path, options = {}) {
  return queueTask(() => executeRequest(path, options));
}

/**
 * Registers a request interceptor.
 * @param {(config:object)=>object|Promise<object>} interceptor Interceptor callback.
 * @returns {() => void} Unsubscribe function.
 * @example
 * const unsubscribe = addRequestInterceptor((config) => ({ ...config, timeout: 10000 }));
 * unsubscribe();
 */
export function addRequestInterceptor(interceptor) {
  requestInterceptors.push(interceptor);
  return () => {
    const index = requestInterceptors.indexOf(interceptor);
    if (index >= 0) {
      requestInterceptors.splice(index, 1);
    }
  };
}

/**
 * Registers a response success interceptor.
 * @param {(data:any, config:object)=>any|Promise<any>} interceptor Interceptor callback.
 * @returns {() => void} Unsubscribe function.
 */
export function addResponseInterceptor(interceptor) {
  responseInterceptors.push(interceptor);
  return () => {
    const index = responseInterceptors.indexOf(interceptor);
    if (index >= 0) {
      responseInterceptors.splice(index, 1);
    }
  };
}

/**
 * Registers a response error interceptor.
 * @param {(error:Error, config:object)=>Error|void|Promise<Error|void>} interceptor Error interceptor callback.
 * @returns {() => void} Unsubscribe function.
 */
export function addResponseErrorInterceptor(interceptor) {
  responseErrorInterceptors.push(interceptor);
  return () => {
    const index = responseErrorInterceptors.indexOf(interceptor);
    if (index >= 0) {
      responseErrorInterceptors.splice(index, 1);
    }
  };
}

/**
 * Adds a global request body transformer.
 * @param {(data:any, config:object)=>any} transformer Transformer callback.
 * @returns {() => void} Unsubscribe function.
 */
export function addRequestTransform(transformer) {
  requestTransforms.push(transformer);
  return () => {
    const index = requestTransforms.indexOf(transformer);
    if (index >= 0) {
      requestTransforms.splice(index, 1);
    }
  };
}

/**
 * Adds a global response transformer.
 * @param {(data:any, config:object)=>any} transformer Transformer callback.
 * @returns {() => void} Unsubscribe function.
 */
export function addResponseTransform(transformer) {
  responseTransforms.push(transformer);
  return () => {
    const index = responseTransforms.indexOf(transformer);
    if (index >= 0) {
      responseTransforms.splice(index, 1);
    }
  };
}

/**
 * Subscribes to loading state updates.
 * @param {(state:{active:number, queued:number, isLoading:boolean})=>void} listener State callback.
 * @returns {() => void} Unsubscribe function.
 */
export function subscribeLoadingState(listener) {
  loadingListeners.add(listener);
  listener(getLoadingState());
  return () => {
    loadingListeners.delete(listener);
  };
}

/**
 * Gets current loading state.
 * @returns {{active:number, queued:number, isLoading:boolean}} Loading state.
 */
export function getLoadingState() {
  return {
    active: activeRequestCount,
    queued: queuedRequestCount,
    isLoading: activeRequestCount + queuedRequestCount > 0
  };
}

/**
 * Sets maximum simultaneous requests.
 * @param {number} limit Max concurrent requests, minimum 1.
 */
export function setConcurrencyLimit(limit) {
  maxConcurrentRequests = Math.max(1, Number(limit) || 1);
  drainQueue();
}

/**
 * Clears all cached request entries.
 */
export function clearRequestCache() {
  requestCache.clear();
}

/**
 * Resets AJAX client runtime state.
 */
export function resetAjaxClient() {
  requestInterceptors.length = 0;
  responseInterceptors.length = 0;
  responseErrorInterceptors.length = 0;
  requestTransforms.length = 0;
  responseTransforms.length = 0;
  clearRequestCache();
  setConcurrencyLimit(4);
}

/**
 * High-level REST client helpers.
 * @returns {{
 * get:(path:string, options?:object)=>Promise<any>,
 * post:(path:string, body?:any, options?:object)=>Promise<any>,
 * put:(path:string, body?:any, options?:object)=>Promise<any>,
 * patch:(path:string, body?:any, options?:object)=>Promise<any>,
 * delete:(path:string, options?:object)=>Promise<any>
 * }}
 * @example
 * const api = useApi();
 * await api.get("/staff", { cache: true });
 * await api.post("/staff", { first_name: "Ana" });
 */
export function useApi() {
  return {
    get: (path, options = {}) => apiRequest(path, { ...options, method: "GET" }),
    post: (path, body, options = {}) => apiRequest(path, { ...options, method: "POST", body }),
    put: (path, body, options = {}) => apiRequest(path, { ...options, method: "PUT", body }),
    patch: (path, body, options = {}) => apiRequest(path, { ...options, method: "PATCH", body }),
    delete: (path, options = {}) => apiRequest(path, { ...options, method: "DELETE" })
  };
}
