import http from 'http';
import { Socket } from 'net';
import { Application } from 'express';

export interface TestResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
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
      req.headers = {
        host: 'localhost',
        'content-type': 'application/json',
        ...(options.headers || {}),
      };

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

        resolve({
          statusCode: res.statusCode,
          headers: res.getHeaders() as Record<string, string | string[] | undefined>,
          body: parsedBody,
          text: output,
        });
        return res;
      };

      if (options.body) {
        process.nextTick(() => {
          req.emit('data', Buffer.from(JSON.stringify(options.body)));
          req.emit('end');
        });
      } else {
        process.nextTick(() => {
          req.emit('end');
        });
      }

      (app as any).handle(req, res);
    } catch (err) {
      reject(err);
    }
  });
}
