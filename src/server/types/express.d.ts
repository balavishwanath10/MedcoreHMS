import { TokenPayload } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      hospitalId?: string;
      targetHospitalId?: string;
    }
  }
}

export {};
