import http from 'http';
import { Socket } from 'net';
import { Application } from 'express';

export interface TestResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  cookies: Record<string, string>;
  body: any;
  text: string;
}

export interface RequestOptions {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export function makeRequest(app: Application, options: RequestOptions): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    try {
      const socket = new Socket();
      const req = new http.IncomingMessage(socket);
      req.method = options.method || 'GET';
      req.url = options.url;

      const normalizedHeaders: Record<string, string> = {
        host: 'localhost',
        'content-type': 'application/json',
      };
      if (options.headers) {
        for (const [k, v] of Object.entries(options.headers)) {
          normalizedHeaders[k.toLowerCase()] = v;
        }
      }

      let bodyBuf: Buffer | null = null;
      if (options.body !== undefined) {
        const bodyStr =
          typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        bodyBuf = Buffer.from(bodyStr);
        normalizedHeaders['content-length'] = String(bodyBuf.length);
      }

      req.headers = normalizedHeaders;

      if (bodyBuf) {
        req.push(bodyBuf);
      }
      req.push(null);

      const res = new http.ServerResponse(req);
      let output = '';

      res.write = (chunk: any) => {
        output += chunk;
        return true;
      };

      res.end = (chunk: any) => {
        if (chunk) output += chunk;
        let parsedBody: any = output;
        try {
          parsedBody = JSON.parse(output);
        } catch {
          // Leave as string if not JSON
        }

        const rawHeaders = res.getHeaders() as Record<string, string | string[] | undefined>;
        const setCookie = rawHeaders['set-cookie'];
        const cookies: Record<string, string> = {};

        if (setCookie) {
          const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
          for (const c of cookieArray) {
            const parts = c.split(';')[0].split('=');
            if (parts.length === 2) {
              cookies[parts[0].trim()] = parts[1].trim();
            }
          }
        }

        resolve({
          statusCode: res.statusCode,
          headers: rawHeaders,
          cookies,
          body: parsedBody,
          text: output,
        });
        return res;
      };

      (app as any).handle(req, res);
    } catch (err) {
      reject(err);
    }
  });
}
