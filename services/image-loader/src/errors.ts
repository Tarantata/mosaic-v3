// services/image-loader/src/errors.ts
import type { Request, Response, NextFunction } from 'express';

export function asyncWrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// единый обработчик ошибок
export function errorMiddleware(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const msg = err?.message || 'Internal Server Error';
  const details = process.env.NODE_ENV === 'development' ? (err?.stack || err) : undefined;
  res.status(status).json({ error: msg, details });
}
