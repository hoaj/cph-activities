// A short-lived id -> item index in memory, filled by the tools' results, so get_details can answer for
// an id a tool returned earlier. Public listing data only; one index for the whole process.
import type { Merged } from "../../planner/merge";
import type { Item } from "../../planner/types";

export interface Indexed {
  item: Merged;
  /** The rows (one per source) the item was merged from. */
  rows: Item[];
}

export class ItemIndex {
  private byId = new Map<string, { at: number; entry: Indexed }>();
  constructor(private o: { ttlMs?: number; max?: number; now?: () => number } = {}) {}

  /** Remembers merged items under each of their ids. `raw` holds the rows they came from. */
  remember(merged: Merged[], raw: Item[]): void {
    const now = (this.o.now ?? Date.now)();
    const rawById = new Map(raw.map((r) => [r.id, r]));
    for (const m of merged) {
      const rows = m.ids.map((id) => rawById.get(id)).filter((r): r is Item => !!r);
      const entry: Indexed = { item: m, rows: rows.length ? rows : [m] };
      for (const id of m.ids) {
        this.byId.delete(id);
        this.byId.set(id, { at: now, entry });
      }
    }
    const max = this.o.max ?? 3000;
    while (this.byId.size > max) this.byId.delete(this.byId.keys().next().value!);
  }

  get(id: string): Indexed | undefined {
    const e = this.byId.get(id);
    if (!e) return undefined;
    if ((this.o.now ?? Date.now)() - e.at > (this.o.ttlMs ?? 2 * 3600_000)) {
      this.byId.delete(id);
      return undefined;
    }
    return e.entry;
  }

  get size(): number {
    return this.byId.size;
  }
}
