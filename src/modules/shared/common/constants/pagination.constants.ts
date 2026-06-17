export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
// Hard ceiling on page index so an absurd `page` can't produce a massive OFFSET.
export const MAX_PAGE = 100_000;
