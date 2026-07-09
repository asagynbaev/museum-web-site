/**
 * Resolve a path inside the /public folder, respecting Vite's base URL so the
 * build keeps working when deployed under a sub-path.
 *
 *   asset('media/hero-poster.jpg') -> '/media/hero-poster.jpg'
 */
export const asset = (path) =>
  `${import.meta.env.BASE_URL}${String(path).replace(/^\//, '')}`;
