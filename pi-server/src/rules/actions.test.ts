import { describe, expect, test } from "vitest";

import { applyActions, type ActionPayload } from "./actions.ts";
import type { TxnLike } from "./conditions.ts";

describe("applyActions", () => {
  test("set_payee sets payeeName", () => {
    const out = applyActions({ actions: [{ type: "set_payee", value: "Blinkit" }] }, {
      payeeName: "old",
    });
    expect(out.payeeName).toBe("Blinkit");
  });

  test("set_category sets categoryId", () => {
    const out = applyActions({ actions: [{ type: "set_category", value: "cat-groceries" }] }, {});
    expect(out.categoryId).toBe("cat-groceries");
  });

  describe("set_notes modes", () => {
    test("replace", () => {
      const out = applyActions(
        { actions: [{ type: "set_notes", value: { mode: "replace", text: "new" } }] },
        { notes: "old" },
      );
      expect(out.notes).toBe("new");
    });
    test("append onto existing (newline-separated)", () => {
      const out = applyActions(
        { actions: [{ type: "set_notes", value: { mode: "append", text: "add" } }] },
        { notes: "base" },
      );
      expect(out.notes).toBe("base\nadd");
    });
    test("append onto empty produces just the text", () => {
      const out = applyActions(
        { actions: [{ type: "set_notes", value: { mode: "append", text: "add" } }] },
        {},
      );
      expect(out.notes).toBe("add");
    });
    test("prepend onto existing", () => {
      const out = applyActions(
        { actions: [{ type: "set_notes", value: { mode: "prepend", text: "top" } }] },
        { notes: "base" },
      );
      expect(out.notes).toBe("top\nbase");
    });
  });

  test("is pure — does not mutate the input txn", () => {
    const txn: TxnLike = { payeeName: "old", categoryId: "c0" };
    const out = applyActions({ actions: [{ type: "set_payee", value: "new" }] }, txn);
    expect(txn.payeeName).toBe("old"); // untouched
    expect(out).not.toBe(txn); // new object
    expect(out.payeeName).toBe("new");
  });

  test("multiple actions thread in order", () => {
    const payload: ActionPayload = {
      actions: [
        { type: "set_payee", value: "Zomato" },
        { type: "set_category", value: "cat-food" },
        { type: "set_notes", value: { mode: "replace", text: "auto" } },
      ],
    };
    const out = applyActions(payload, {});
    expect(out).toMatchObject({ payeeName: "Zomato", categoryId: "cat-food", notes: "auto" });
  });

  test("unknown action type is ignored (pass-through)", () => {
    const out = applyActions(
      { actions: [{ type: "set_amount", value: 999 } as never] },
      { payeeName: "keep" },
    );
    expect(out.payeeName).toBe("keep");
  });

  test("empty / malformed action set returns a copy unchanged", () => {
    const out = applyActions({ actions: [] }, { payeeName: "keep" });
    expect(out.payeeName).toBe("keep");
  });
});
