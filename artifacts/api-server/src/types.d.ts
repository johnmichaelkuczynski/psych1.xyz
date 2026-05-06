declare global {
  namespace Express {
    interface Request {
      studentId?: number;
    }
  }
}

export {};
