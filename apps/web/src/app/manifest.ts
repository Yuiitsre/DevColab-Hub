import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DevCollab Hub',
    short_name: 'DevCollab',
    description: 'Engineering operations, done together.',
    start_url: '/signin',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#22c55e',
    icons: [
      {
        src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 rx=%2222%22 fill=%22%2322c55e%22/%3E%3Ctext y=%22.9em%22 font-size=%2260%22 font-weight=%22900%22 fill=%22%23000%22 x=%2218%22%3EDC%3C/text%3E%3C/svg%3E',
        sizes: 'any',
        type: 'image/svg+xml'
      }
    ]
  };
}

