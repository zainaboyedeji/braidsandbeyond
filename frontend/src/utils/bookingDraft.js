// The booking in progress, kept for the browser tab so leaving to log in or sign up doesn't lose it.
// sessionStorage can be blocked (private mode, strict settings): then it simply isn't kept.
const KEY = 'booking_draft';
const MAX_AGE_MS = 60 * 60 * 1000;

export function saveBookingDraft(draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // storage unavailable
  }
}

export function loadBookingDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(KEY));
    return draft && Date.now() - draft.savedAt < MAX_AGE_MS ? draft : null;
  } catch {
    return null;
  }
}

export function clearBookingDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}
