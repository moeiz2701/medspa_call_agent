import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo: pin the file-tracing root so Next doesn't pick a stray
  // parent lockfile (Vercel deploy correctness).
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
