/** Let input, scrolling and painting run between small chunks of DOM work. */
export function yieldToPage(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
