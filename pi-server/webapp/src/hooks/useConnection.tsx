import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  clearCredentials,
  getApiKey,
  getServerUrl,
  isConnected as isConnectedNow,
  setCredentials,
  UNAUTHORIZED_EVENT,
} from "@/lib/api";

interface ConnectionState {
  connected: boolean;
  apiKey: string;
  serverUrl: string;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  connect: (apiKey: string, serverUrl: string) => void;
  disconnect: () => void;
}

const ConnectionContext = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [connected, setConnected] = useState(isConnectedNow);
  // Disconnected visitors now land on the public product page. Connection is
  // an explicit action there; authentication failures still open the dialog.
  const [dialogOpen, setDialogOpen] = useState(false);

  // A 401 anywhere means the key is stale/missing — surface the connect UI.
  useEffect(() => {
    const onUnauthorized = () => {
      setConnected(false);
      setDialogOpen(true);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const connect = useCallback(
    (apiKey: string, serverUrl: string) => {
      const prevKey = getApiKey();
      const prevUrl = getServerUrl();
      setCredentials(apiKey, serverUrl);
      const identityChanged = getApiKey() !== prevKey || getServerUrl() !== prevUrl;
      setConnected(true);
      setDialogOpen(false);
      // A different server/key means the cache holds another server's data —
      // drop it entirely rather than showing stale rows while refetching (and
      // leaving them if the new request fails). Same identity: just refresh.
      if (identityChanged) client.clear();
      else void client.invalidateQueries();
    },
    [client],
  );

  const disconnect = useCallback(() => {
    clearCredentials();
    client.clear();
    setConnected(false);
    setDialogOpen(true);
  }, [client]);

  const value = useMemo<ConnectionState>(
    () => ({
      connected,
      apiKey: getApiKey(),
      serverUrl: getServerUrl(),
      dialogOpen,
      openDialog: () => setDialogOpen(true),
      closeDialog: () => setDialogOpen(false),
      connect,
      disconnect,
    }),
    [connected, dialogOpen, connect, disconnect],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionState {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}
