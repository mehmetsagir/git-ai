/**
 * Error handling utilities
 */

/**
 * Safely convert unknown error to Error instance
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error('Unknown error occurred');
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  return toError(error).message;
}

