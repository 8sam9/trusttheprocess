/** True when the element is rendered inside a ScrollView (so it can be scrolled out of view). */
export function insideScrollView(el: { parent: unknown }): boolean {
  for (
    let node = el.parent as { type: unknown; parent: unknown } | null;
    node;
    node = node.parent as typeof node
  ) {
    const type = String(node.type);
    if (/Modal/.test(type)) return false; // a Modal's own content starts here; outer scroll views do not count
    if (type === 'RCTScrollView') return true;
  }
  return false;
}
