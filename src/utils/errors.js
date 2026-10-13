// Помилки мають стабільні коди; HTTP-перетворення виконує middleware.
export class BusinessError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.details = details;
  }
}

export class ResourceNotFoundError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ResourceNotFoundError';
    this.code = code;
  }
}

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
