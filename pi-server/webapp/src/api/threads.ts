import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { DeleteThreadsResponse, ThreadResponse, ThreadsResponse } from "@/lib/types";

import { qk } from "./keys";

/** Shared query options for a single thread's turns, so the ThreadList can
    `queryClient.fetchQuery` on click with the same key `useThread` caches under. */
export function threadQueryOptions(threadId: string) {
  return {
    queryKey: qk.thread(threadId),
    queryFn: () =>
      api.get<ThreadResponse>(`/v1/messages/threads/${encodeURIComponent(threadId)}`),
  };
}

/** The chat-history ("chatrooms") list, newest first. staleTime keeps the list
    stable while the user toggles between the conversation and history views. */
export function useThreads(enabled = true) {
  return useQuery({
    queryKey: qk.threads,
    enabled,
    staleTime: 30_000,
    queryFn: () => api.get<ThreadsResponse>("/v1/messages/threads?limit=100"),
  });
}

/** Delete one or more complete conversations. Financial actions referenced by
    their turns are intentionally untouched; this only removes chat history. */
export function useDeleteThreads() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (threadIds: string[]) =>
      api.post<DeleteThreadsResponse>("/v1/messages/threads/delete", { threadIds }),
    onSuccess: (result) => {
      const deleted = new Set(result.deletedThreadIds);
      client.setQueryData<ThreadsResponse>(qk.threads, (current) =>
        current
          ? { threads: current.threads.filter((thread) => !deleted.has(thread.threadId)) }
          : current,
      );
      for (const threadId of result.deletedThreadIds) {
        client.removeQueries({ queryKey: qk.thread(threadId) });
      }
      void client.invalidateQueries({ queryKey: qk.threads });
    },
  });
}

/** A single thread's turns (ascending). Only runs when a threadId is passed. */
export function useThread(threadId: string | undefined) {
  return useQuery({
    ...threadQueryOptions(threadId ?? ""),
    enabled: Boolean(threadId),
  });
}
