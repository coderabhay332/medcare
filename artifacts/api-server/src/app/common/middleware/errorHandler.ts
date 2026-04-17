import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../../lib/logger.js';

export interface AppError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.message ?? 'Internal Server Error';

  logger.error({ err, url: req.url, method: req.method }, 'Request error');

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}
