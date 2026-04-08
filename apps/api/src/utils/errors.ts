export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, code?: string) {
    return new AppError(400, message, code);
  }

  static unauthorized(message: string, code?: string) {
    return new AppError(401, message, code);
  }

  static forbidden(message: string, code?: string) {
    return new AppError(403, message, code);
  }

  static notFound(message: string, code?: string) {
    return new AppError(404, message, code);
  }

  static conflict(message: string, code?: string) {
    return new AppError(409, message, code);
  }
}
