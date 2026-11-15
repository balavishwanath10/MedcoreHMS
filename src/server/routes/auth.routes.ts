import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  sendEmailOtp,
  verifyEmailOtp,
  sendPhoneOtp,
  verifyPhoneOtp,
  getMe,
} from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

export const authRouter = Router();

// Registration & Authentication
authRouter.post('/register', register);
authRouter.post('/login', authRateLimiter, login);
authRouter.post('/refresh', refreshToken);
authRouter.post('/logout', logout);

// Password Recovery
authRouter.post('/forgot-password', authRateLimiter, forgotPassword);
authRouter.post('/reset-password', authRateLimiter, resetPassword);

// OTP Verification (Email & Phone)
authRouter.post('/send-email-otp', authRateLimiter, sendEmailOtp);
authRouter.post('/verify-email-otp', verifyEmailOtp);
authRouter.post('/send-phone-otp', authRateLimiter, sendPhoneOtp);
authRouter.post('/verify-phone-otp', verifyPhoneOtp);

// Authenticated User Context
authRouter.get('/me', authenticateToken, getMe);
