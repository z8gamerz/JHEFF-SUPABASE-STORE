import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ApiCompatibleResponse {
  statusCode: number;
  status(code: number): ApiCompatibleResponse;
  setHeader(name: string, value: string | string[]): ApiCompatibleResponse;
  json(payload: any): ApiCompatibleResponse;
  end(chunk?: any): ApiCompatibleResponse;
}

export function adaptNodeResponse(res: ServerResponse): ApiCompatibleResponse {
  if (typeof (res as any).status === 'function' && typeof (res as any).json === 'function') {
    return res as unknown as ApiCompatibleResponse;
  }

  let currentStatus = res.statusCode || 200;

  const adapted: ApiCompatibleResponse = {
    get statusCode() {
      return currentStatus;
    },
    set statusCode(code: number) {
      currentStatus = code;
      res.statusCode = code;
    },
    status(code: number) {
      currentStatus = code;
      res.statusCode = code;
      return adapted;
    },
    setHeader(name: string, value: string | string[]) {
      if (!res.headersSent) {
        res.setHeader(name, value);
      }
      return adapted;
    },
    json(payload: any) {
      if (res.writableEnded) return adapted;
      if (!res.headersSent) {
        res.statusCode = currentStatus || 200;
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify(payload));
      return adapted;
    },
    end(chunk?: any) {
      if (!res.writableEnded) {
        if (!res.headersSent) {
          res.statusCode = currentStatus || 200;
        }
        res.end(chunk);
      }
      return adapted;
    },
  };

  return adapted;
}

export async function dispatchApiHandler(
  handler: (req: any, res: any) => Promise<any> | any,
  req: IncomingMessage & { body?: any },
  res: ServerResponse
): Promise<void> {
  const adaptedRes = adaptNodeResponse(res);
  try {
    await handler(req, adaptedRes);
  } catch (err: any) {
    console.error('[API Adapter Error]:', err?.message || err);
    if (!res.writableEnded) {
      adaptedRes.status(500).json({
        success: false,
        error: 'Internal server error.',
      });
    }
  }
}
