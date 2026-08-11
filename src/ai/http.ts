/**
 * HTTP client for AI provider API requests
 * Uses Node.js built-in http/https modules (no external dependencies)
 */

import * as https from "https";
import * as http from "http";

export interface HTTPRequestOptions {
  headers: Record<string, string>;
  timeout: number;
}

export interface HTTPResponse {
  status: number;
  body: string;
}

/**
 * Make an HTTP POST request
 *
 * @param urlStr - Full URL to request
 * @param options - Request options (headers, timeout)
 * @param body - Request body (JSON string)
 * @returns Promise resolving to response
 */
export function httpRequest(
  urlStr: string,
  options: HTTPRequestOptions,
  body?: string,
): Promise<HTTPResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === "https:";
    const mod = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: options.headers,
      timeout: options.timeout,
    };

    const req = mod.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode || 500,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`AI request timed out after ${options.timeout}ms`));
    });
    req.on("error", reject);

    if (body) req.write(body);
    req.end();
  });
}
