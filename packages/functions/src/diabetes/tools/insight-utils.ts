/**
 * Strip color markup for comparison (e.g., "[green]Hello[/]" -> "hello")
 * Handles nested, malformed, or missing closing tags
 */
export function stripMarkup(text: string): string {
  return text.replace(/\[(?:\/|\w+)\]/g, "").trim().toLowerCase();
}
