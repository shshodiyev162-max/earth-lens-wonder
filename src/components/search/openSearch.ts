/** Lets any page open the global Ctrl/⌘K search, which lives in the navbar. */
export const OPEN_SEARCH_EVENT = "terravision:open-search";

export function openGlobalSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}
