/**
 * Types for AI provider payloads and responses
 */

export interface AIProviderPayload {
  [key: string]: unknown;
}

/**
 * Convert a Buffer to a data URL
 *
 * @param buffer - Image buffer
 * @returns Data URL string
 */
export function toDataURL(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
