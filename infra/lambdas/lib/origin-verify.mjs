export function originIsValid(event) {
  const expected = process.env.ORIGIN_VERIFY_SECRET;
  if (!expected) return false;
  const headers = event.headers ?? {};
  const got = headers["x-origin-verify"] ?? headers["X-Origin-Verify"];
  return got === expected;
}
