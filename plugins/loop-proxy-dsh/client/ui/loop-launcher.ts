/**
 * Lower than the host account launcher's default priority. The single-slot
 * owner keeps both registrations, so disposing this contribution restores the
 * original host entry without re-registering it.
 */
export const LOOP_LAUNCHER_PRIORITY = -1000
