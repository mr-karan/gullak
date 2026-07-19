import { useState } from "react";

import { verifyCredentials, type ApiError } from "@/lib/api";
import { useConnection } from "@/hooks/useConnection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConnectDialog() {
  const { dialogOpen, closeDialog, connected, apiKey, serverUrl, connect, disconnect } = useConnection();
  const [key, setKey] = useState(apiKey);
  const [url, setUrl] = useState(serverUrl);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const k = key.trim();
    if (!k) {
      setError("API key is required.");
      return;
    }
    setChecking(true);
    try {
      // Verify BEFORE persisting: a typo or unreachable server must never
      // destroy the previous working credentials.
      await verifyCredentials(k, url);
      connect(k, url); // only now persist + flip connected state
    } catch (err) {
      setError((err as ApiError).message || "Could not connect.");
    } finally {
      setChecking(false);
    }
  }

  function handleDisconnect() {
    disconnect();
    // Clear the controlled inputs so the old key isn't retained/redisplayed.
    setKey("");
    setUrl("");
    setError("");
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => (open ? undefined : connected && closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to your Gullak</DialogTitle>
          <DialogDescription>
            Point the app at your pi-server and paste its API key. Everything stays on your server.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={verify} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              placeholder="x-api-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="server-url">
              Server URL <span className="font-normal text-ink-2">(optional)</span>
            </Label>
            <Input
              id="server-url"
              type="url"
              inputMode="url"
              placeholder="Same origin — leave blank"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-neg">{error}</p> : null}
          <div className="mt-1 flex items-center justify-between gap-2">
            {connected ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {connected ? (
                <Button type="button" variant="ghost" size="sm" onClick={closeDialog}>
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" disabled={checking}>
                {checking ? "Checking…" : "Connect"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
