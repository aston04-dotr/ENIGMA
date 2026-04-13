// Smart Russian phone number input utilities

/**
 * Formats phone for display in input with mask
 * Input: raw user input
 * Output: formatted for display (+7 (9XX) XXX-XX-XX)
 */
export function formatRussianPhoneInput(raw: string): string {
  if (!raw) return "";
  
  // Remove all non-digits
  const digits = raw.replace(/\D/g, "");
  
  // Handle empty case
  if (!digits) return "";
  
  // Convert leading 8 to 7 for Russian numbers
  let normalizedDigits = digits;
  if (digits.startsWith("8") && digits.length <= 11) {
    normalizedDigits = "7" + digits.slice(1);
  }
  
  // For Russian mobile numbers (starting with 7 or 9)
  if (normalizedDigits.startsWith("7") || normalizedDigits.startsWith("9")) {
    // If starts with 9, assume Russian mobile and prepend 7
    if (normalizedDigits.startsWith("9")) {
      normalizedDigits = "7" + normalizedDigits;
    }
    
    // Apply Russian mobile format: +7 (XXX) XXX-XX-XX
    const limited = normalizedDigits.slice(0, 11); // max 11 digits
    
    if (limited.length === 0) return "";
    if (limited.length === 1) return `+7`;
    if (limited.length === 2) return `+7 (${limited[1]}`;
    if (limited.length <= 4) return `+7 (${limited.slice(1)}`;
    if (limited.length <= 7) return `+7 (${limited.slice(1, 4)}) ${limited.slice(4)}`;
    if (limited.length <= 9) return `+7 (${limited.slice(1, 4)}) ${limited.slice(4, 7)}-${limited.slice(7)}`;
    return `+7 (${limited.slice(1, 4)}) ${limited.slice(4, 7)}-${limited.slice(7, 9)}-${limited.slice(9, 11)}`;
  }
  
  // For other formats, just return with + prefix if needed
  if (digits.length > 0 && !raw.startsWith("+")) {
    return "+" + digits.slice(0, 15);
  }
  
  return raw.slice(0, 16);
}

/**
 * Normalizes phone for storage in database
 * Input: any format
 * Output: +7XXXXXXXXXX (12 chars) or null
 */
export function normalizeRussianPhone(raw: string): string | null {
  if (!raw) return null;
  
  // Remove all non-digits
  const digits = raw.replace(/\D/g, "");
  
  if (!digits) return null;
  
  // Russian mobile: 11 digits starting with 7 or 8 or 9
  if (digits.length === 11) {
    if (digits.startsWith("7") || digits.startsWith("8") || digits.startsWith("9")) {
      // If starts with 8, convert to 7
      const normalized = digits.startsWith("8") ? "7" + digits.slice(1) : digits;
      // If starts with 9, it's missing the 7
      const finalDigits = digits.startsWith("9") ? "7" + digits : normalized;
      return "+" + finalDigits;
    }
  }
  
  // Already has +7 format
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const normalized = digits.startsWith("8") ? "7" + digits.slice(1) : digits;
    return "+" + normalized;
  }
  
  // If 10 digits starting with 9, add +7
  if (digits.length === 10 && digits.startsWith("9")) {
    return "+7" + digits;
  }
  
  // If starts with + and looks valid, try to use it
  const hasPlus = raw.startsWith("+");
  if (hasPlus && digits.length >= 10) {
    return "+" + digits.slice(0, 15);
  }
  
  return null;
}

/**
 * Validates Russian mobile phone number
 */
export function isValidRussianPhone(raw: string): boolean {
  const normalized = normalizeRussianPhone(raw);
  if (!normalized) return false;
  
  // Must be +7XXXXXXXXXX (12 chars total)
  if (normalized.startsWith("+7") && normalized.length === 12) {
    // Second digit after +7 must be 9 for mobile
    const secondDigit = normalized[2];
    return secondDigit === "9";
  }
  
  return false;
}

/**
 * Handles input change with smart formatting
 * Returns object with formatted value and cursor position adjustment
 */
export function handlePhoneInputChange(
  currentValue: string,
  newRawValue: string,
  cursorPosition: number
): { value: string; cursorPosition: number } {
  // If deleting (new value is shorter)
  if (newRawValue.length < currentValue.length) {
    const formatted = formatRussianPhoneInput(newRawValue);
    return { value: formatted, cursorPosition: Math.min(cursorPosition, formatted.length) };
  }
  
  // Format the new value
  const formatted = formatRussianPhoneInput(newRawValue);
  
  // Calculate new cursor position
  let newCursorPos = cursorPosition;
  
  // If we added formatting characters, adjust cursor
  if (formatted.length > currentValue.length) {
    const addedChars = formatted.length - currentValue.length;
    newCursorPos = cursorPosition + addedChars;
  }
  
  return { value: formatted, cursorPosition: newCursorPos };
}

/**
 * Formats phone for display in profile
 * Input: +79181234567
 * Output: +7 (918) 123-45-67
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  
  // Remove non-digits
  const digits = phone.replace(/\D/g, "");
  
  // Russian format
  if (digits.startsWith("7") && digits.length === 11) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  
  return phone;
}
