/**
 * Rect helpers for SDK calls that validate bounds.
 *
 * sn-plugin-lib 0.1.65: lassoElements REQUIRES the rect to be fully within
 * the page bounds -- out-of-bounds calls fail (SNDEV-70). Our mark flows pad
 * text rects by 10px, which overflows for captures near a page edge, so
 * every computed rect passes through here before lassoElements.
 */

/**
 * Clamp a {left, top, right, bottom} rect to page bounds, preserving at
 * least a 1px extent. Returns the rect unchanged when pageSize is unknown
 * (pre-0.1.65 devices tolerate overflow, so unknown size degrades safely).
 */
export function clampRectToPage(rect, pageSize) {
  if (!rect || !pageSize?.width || !pageSize?.height) return rect;
  const left = Math.max(0, Math.min(rect.left, pageSize.width - 1));
  const top = Math.max(0, Math.min(rect.top, pageSize.height - 1));
  const right = Math.min(pageSize.width, Math.max(rect.right, left + 1));
  const bottom = Math.min(pageSize.height, Math.max(rect.bottom, top + 1));
  return {left, top, right, bottom};
}
