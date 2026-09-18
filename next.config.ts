import type { NextConfig } from 'next'

const config: NextConfig = {
  images: {
    // Pictures chosen in the back office live in Supabase Storage.
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  // Nothing here needs to be discovered by a header.
  poweredByHeader: false,
}

export default config
