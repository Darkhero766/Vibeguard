// SYNTHETIC VULNERABLE DEMO — DO NOT DEPLOY; the string below is not a real credential.
const JWT_SECRET = "DEMO_NOT_REAL_JWT_SECRET_1234567890";
export const insecure = () => JWT_SECRET.length;
