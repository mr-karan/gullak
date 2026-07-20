import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// The register's current multi-select, lifted ABOVE both the Transactions page
// and the assistant chat so a "categorize these" / "delete these" message can
// carry the ticked ids to the agent. The page publishes into it; the chat reads
// from it. Deliberately tiny — just the ids and a setter.
interface SelectionState {
  selectedTransactionIds: string[];
  setSelectedTransactionIds: (ids: string[]) => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const value = useMemo<SelectionState>(
    () => ({ selectedTransactionIds, setSelectedTransactionIds }),
    [selectedTransactionIds],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionState {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}
