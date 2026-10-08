import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Renamed out of `experimental` in Next 15 (was serverComponentsExternalPackages).
  // Keeps the `ws` package as a server-side external so it isn't bundled.
  serverExternalPackages: ['ws'],
};
export default nextConfig;
