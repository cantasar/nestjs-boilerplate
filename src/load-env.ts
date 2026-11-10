// Loads .env before other modules read process.env. Must stay the first import in main.ts.
try {
  process.loadEnvFile();
} catch {
  // No .env file (normal in production).
}
