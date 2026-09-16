export class DomainError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = 'DOMAIN_ERROR',
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
