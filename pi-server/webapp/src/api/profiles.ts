import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Profile, ProfilesResponse } from "@/lib/types";

import { qk } from "./keys";

// Sensible household defaults if the server doesn't expose /v1/profiles yet, so
// the person picker still works (mirrors the legacy fallback).
const FALLBACK: Profile[] = [
  { id: "karan", name: "Karan", emoji: "🧔" },
  { id: "wife", name: "Wife", emoji: "💁‍♀️" },
];

export function useProfiles(enabled = true) {
  return useQuery({
    queryKey: qk.profiles,
    enabled,
    retry: false,
    queryFn: async () => {
      try {
        const res = await api.get<ProfilesResponse>("/v1/profiles");
        return res.profiles.length ? res.profiles : FALLBACK;
      } catch {
        return FALLBACK;
      }
    },
  });
}
