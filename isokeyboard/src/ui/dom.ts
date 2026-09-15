/** The typed helper functions for the elements in index.html. */

export function el<T extends Element = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`index.html is missing #${id}`);
  return node as unknown as T;
}

export interface OptionSpec {
  readonly value: string;
  readonly label: string;
  readonly group?: string;
  readonly title?: string;
}

/** Fills a `<select>` element again. The code groups the options by the
 *  `group` field. It then selects the option with the value `selected`, if the
 *  list contains that value. */
export function fillSelect(select: HTMLSelectElement, options: readonly OptionSpec[], selected: string): void {
  select.replaceChildren();
  let group: HTMLOptGroupElement | null = null;
  for (const spec of options) {
    const option = document.createElement("option");
    option.value = spec.value;
    option.textContent = spec.label;
    if (spec.title) option.title = spec.title;
    if (spec.group) {
      if (!group || group.label !== spec.group) {
        group = document.createElement("optgroup");
        group.label = spec.group;
        select.appendChild(group);
      }
      group.appendChild(option);
    } else {
      group = null;
      select.appendChild(option);
    }
  }
  select.value = selected;
}
