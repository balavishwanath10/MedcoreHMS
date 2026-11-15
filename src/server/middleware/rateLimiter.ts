import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // limit each IP to 25 requests per windowMs for auth routes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many authentication attempts from this IP. Please try again in 15 minutes.',
      },
      timestamp: new Date().toISOString(),
    });
  },
  skip: () => process.env.NODE_ENV === 'test', // bypass rate limits during automated tests
});
