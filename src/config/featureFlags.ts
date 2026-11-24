/**
 * Application feature flags.
 *
 * The Virtual Walk Simulator is flagged OFF by default for production end users
 * so the live site always uses real browser Geolocation and Compass APIs.
 *
 * To enable the simulator for local development or QA testing, run with:
 *   VITE_ENABLE_SIMULATOR=true npm run dev
 * or build with:
 *   VITE_ENABLE_SIMULATOR=true npm run build
 */
export const FEATURE_FLAGS = {
  virtualWalkSimulator: import.meta.env.VITE_ENABLE_SIMULATOR === 'true'
} as const;
