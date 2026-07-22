/**
 * The weekly auction cycle's fixed offsets from the Thursday 00:00 week anchor.
 *
 * Single source of truth: the generator (which EMITS the auction_opened event)
 * and the tools layer (which COMPUTES live/closed state from the clock) both
 * import these, so the open/close instants can never drift apart again. Before
 * this module the generator opened the auction THU 12:00 while the tools layer
 * assumed THU 00:00, so a Thursday-morning board read "live" 12h early (Codex
 * R3-P2).
 */
const MIN = 60_000;

/** THU 12:00 — auction opens and the four launch announcements reference it. */
export const AUCTION_OPEN_OFFSET_MS = (12 * 60) * MIN;

/** SAT 20:00 — auction closes, matching the announced public-demo deadline. */
export const AUCTION_CLOSE_OFFSET_MS = ((2 * 24 + 20) * 60) * MIN;
