// Plain mutable state consumed by each test file's own `vi.mock("next/headers", ...)`
// call — the mock factory itself has to live directly in each test file for
// Vitest's hoisting to apply reliably, but the state it reads/writes is
// shared here so tests can set up a request's cookies/IP before calling
// the server action under test.
export const mockCookies = new Map<string, string>();
export const mockRequestHeaders = new Map<string, string>();

export function resetMockRequest() {
  mockCookies.clear();
  mockRequestHeaders.clear();
  mockRequestHeaders.set("x-forwarded-for", "127.0.0.1");
}
