import type { Request, Response, NextFunction } from 'express';

const requestCounts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 100;

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();

  const entry = requestCounts.get(ip);

  if (!entry || entry.resetAt < now) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= MAX_REQUESTS) {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
    });
    return;
  }

  entry.count++;
  next();
}
