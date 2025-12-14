/**
 * Validation utilities for user input
 */

/**
 * Validate OpenAI API key format
 */
export function validateOpenAIKey(input: string): string | true {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return "OpenAI API Key is required!";
  }
  if (!trimmed.startsWith("sk-")) {
    return 'OpenAI API Key must start with "sk-"!';
  }
  return true;
}

/**
 * Validate git user name (allows "q" to cancel)
 */
export function validateUserName(input: string): string | true {
  const trimmed = input.trim();
  if (trimmed.toLowerCase() === "q") {
    return true;
  }
  if (trimmed.length === 0) {
    return "Name is required!";
  }
  return true;
}

/**
 * Validate git user email (allows "q" to cancel)
 */
export function validateUserEmail(
  input: string,
  existingEmails: string[] = []
): string | true {
  const trimmed = input.trim();
  if (trimmed.toLowerCase() === "q") {
    return true;
  }
  if (trimmed.length === 0) {
    return "Email is required!";
  }
  if (!trimmed.includes("@")) {
    return "Please enter a valid email address!";
  }
  if (existingEmails.includes(trimmed)) {
    return "This email is already added!";
  }
  return true;
}

/**
 * Validate shortcut key
 */
export function validateShortcut(
  input: string,
  usedShortcuts: Set<string>
): string | true {
  const key = input.trim().toLowerCase();
  if (key === "q") {
    return true;
  }
  if (key.length === 0) {
    return "Shortcut key is required!";
  }
  if (usedShortcuts.has(key)) {
    return "This shortcut is already in use!";
  }
  if (key.includes(" ")) {
    return "Shortcut cannot contain spaces!";
  }
  return true;
}

/**
 * Check if input is cancellation ("q")
 */
export function isCancellation(input: string): boolean {
  return input.trim().toLowerCase() === "q";
}
