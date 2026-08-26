/** Grows a textarea to fit its content instead of scrolling inside a
 * fixed box. Pass as the `ref` (sizes once on mount) and call again
 * from `onChange` (sizes as the user types). Reset to "auto" first so
 * shrinking — e.g. after deleting text — is measured correctly
 * instead of staying stuck at the tallest height ever reached.
 *
 * Shared by every estimate textarea (description, scope, defect,
 * corrective action, materials included, notes) so they all grow the
 * same way with one implementation. */
export function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
