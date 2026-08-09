/**
 * Gallery page size. Shared rather than written twice: the server slices by it
 * and the browser decides whether to ask for more by whether it got a full page
 * back, so the two disagreeing would quietly stop the infinite scroll.
 */
export const PER_PAGE = 30;
