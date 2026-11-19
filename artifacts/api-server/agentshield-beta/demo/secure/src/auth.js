// SYNTHETIC SAFE COUNTEREXAMPLE — not a full authentication implementation.
const JWT_SECRET = process.env.JWT_SECRET;
export const isConfigured = () => Boolean(JWT_SECRET);
