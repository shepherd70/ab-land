/**
 * Legacy map route — the explorer is the home page now; keep old links alive.
 *
 * @module app/map/page
 * Data source: none (redirect)
 * @see CLAUDE.md §1
 */
import { redirect } from "next/navigation";

export default function MapPage(): never {
  redirect("/");
}
