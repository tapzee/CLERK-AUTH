import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * Uploads are shrunk in the browser first, so this is headroom rather
       * than the expected size. The default 1 MB rejects the request before the
       * action runs, so `MAX_UPLOAD_BYTES` never gets to explain itself and the
       * caller sees an opaque 500 instead. Left under Vercel's 4.5 MB body
       * ceiling, which is enforced before our code either way.
       */
      bodySizeLimit: "4.25mb",
    },
  },
};

export default nextConfig;
