import type { SessionUser } from "../domain/auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export {};
