import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { DesireDetail, DesireInput, DesiresResponse, DesireStatus } from "@/lib/types";

import { qk } from "./keys";

export function useDesires(person?: string, status?: string, enabled = true) {
  const query = useQuery({
    queryKey: qk.desires(person, status),
    enabled,
    retry: false,
    queryFn: () => {
      const p = new URLSearchParams();
      if (person) p.set("person", person);
      if (status) p.set("status", status);
      const qs = p.toString();
      return api.get<DesiresResponse>(`/v1/desires${qs ? `?${qs}` : ""}`);
    },
    select: (d) => d.desires,
  });
  const notDeployed =
    query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 501);
  return { ...query, notDeployed };
}

export function useDesire(id: string | null) {
  return useQuery({
    queryKey: qk.desire(id ?? ""),
    enabled: Boolean(id),
    queryFn: () => api.get<DesireDetail>(`/v1/desires/${id}`),
  });
}

export function useCreateDesire() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DesireInput) => api.post("/v1/desires", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["desires"] }),
  });
}

export function useUpdateDesire() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      patch: Partial<{
        title: string;
        why: string | null;
        status: DesireStatus;
        estCostCents: number;
        boughtTransactionId: string | null;
      }>;
    }) => api.patch(`/v1/desires/${vars.id}`, vars.patch),
    onSuccess: (_d, vars) => {
      void client.invalidateQueries({ queryKey: ["desires"] });
      void client.invalidateQueries({ queryKey: qk.desire(vars.id) });
    },
  });
}

export function useDeleteDesire() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/v1/desires/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["desires"] }),
  });
}

export function useAddDesireComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; person: string | null; body: string }) =>
      api.post(`/v1/desires/${vars.id}/comments`, { person: vars.person, body: vars.body }),
    onSuccess: (_d, vars) =>
      void client.invalidateQueries({ queryKey: qk.desire(vars.id) }),
  });
}

export function useUploadDesirePhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; file: File }) =>
      api.upload(`/v1/desires/${vars.id}/photos`, vars.file),
    onSuccess: (_d, vars) => {
      void client.invalidateQueries({ queryKey: qk.desire(vars.id) });
      void client.invalidateQueries({ queryKey: ["desires"] });
    },
  });
}

/** Fetch a protected desire photo as an object URL and revoke it on cleanup.
    <img> can't send the api key, so we go blob -> createObjectURL. */
export function useDesirePhotoUrl(desireId: string | null, photoId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!desireId || !photoId) return;
    let active = true;
    let objectUrl: string | null = null;
    api
      .blobUrl(`/v1/desires/${desireId}/photos/${photoId}`)
      .then((u) => {
        objectUrl = u;
        if (active) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [desireId, photoId]);
  return url;
}
