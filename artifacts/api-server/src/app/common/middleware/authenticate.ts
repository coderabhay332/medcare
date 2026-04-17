import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import type { Document } from 'mongoose';

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  passport.authenticate(
    'jwt',
    { session: false },
    (err: Error | null, user: Document | false) => {
      if (err) return next(err);
      if (!user) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      req.user = user;
      next();
    }
  )(req, res, next);
}
