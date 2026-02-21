const cacheStore = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function isRetryableError(error) {
  return error instanceof TypeError;
}

export async function fetchJson(url, options = {}) {
  const {
    method = "GET",
    headers,
    body,
    timeoutMs = 7000,
    retries = 1,
    retryDelayMs = 350,
    cacheTtlMs = 0,
    cacheKey,
    signal,
  } = options;

  const upperMethod = method.toUpperCase();
  const canUseCache = upperMethod === "GET" && cacheTtlMs > 0;
  const resolvedCacheKey = cacheKey || `${upperMethod}:${url}`;

  if (canUseCache) {
    const cached = cacheStore.get(resolvedCacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  const maxAttempts = Math.max(1, retries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    let didTimeout = false;
    let timeoutId;

    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        const abortedError = new Error("Solicitud cancelada");
        abortedError.name = "AbortError";
        throw abortedError;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, timeoutMs);

      const response = await fetch(url, {
        method: upperMethod,
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;

        if (attempt < maxAttempts && isRetryableStatus(response.status)) {
          await sleep(retryDelayMs * attempt);
          continue;
        }

        throw error;
      }

      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (canUseCache) {
        cacheStore.set(resolvedCacheKey, {
          data,
          expiresAt: Date.now() + cacheTtlMs,
        });
      }

      return data;
    } catch (error) {
      if (didTimeout) {
        const timeoutError = new Error(
          `Tiempo de espera agotado (${timeoutMs} ms)`,
        );
        timeoutError.name = "TimeoutError";

        if (attempt < maxAttempts) {
          await sleep(retryDelayMs * attempt);
          continue;
        }

        throw timeoutError;
      }

      if (error?.name === "AbortError" || signal?.aborted) {
        throw error;
      }

      if (attempt < maxAttempts && isRetryableError(error)) {
        await sleep(retryDelayMs * attempt);
        continue;
      }

      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    }
  }

  throw new Error("No fue posible completar la solicitud");
}
