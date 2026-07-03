import { z } from "zod";

// Shared length bounds for user-supplied strings on the CRUD routes. These are
// generous — the app produces far shorter values — but they stop a caller from
// pushing megabyte-scale names/notes within the global body limit. The sync
// push path validates payloads separately (payload: z.unknown()), so these
// only bound the direct REST callers.

/** A required short label (account/category/payee/tag names). */
export const nameField = z.string().min(1).max(200);

/** An optional free-text field (notes, location names, descriptions). */
export const textField = z.string().max(2000);
