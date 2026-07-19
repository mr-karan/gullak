import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/shell/AppShell";
import { AccountsPage } from "@/pages/AccountsPage";
import { ChatPage } from "@/pages/ChatPage";
import { GoalsPage } from "@/pages/GoalsPage";
import { HoldingsPage } from "@/pages/HoldingsPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { DesiresPage } from "@/pages/DesiresPage";
import { InsightsPage } from "@/pages/InsightsPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<AccountsPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="holdings" element={<HoldingsPage />} />
        <Route path="desires" element={<DesiresPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
