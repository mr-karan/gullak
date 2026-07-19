import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { CategoriesResponse, CategoryGroupsResponse } from "@/lib/types";

import { qk } from "./keys";

export function useCategories(enabled = true) {
  return useQuery({
    queryKey: qk.categories,
    enabled,
    queryFn: () => api.get<CategoriesResponse>("/v1/categories"),
    select: (d) => d.categories,
  });
}

export function useCategoryGroups(enabled = true) {
  return useQuery({
    queryKey: qk.categoryGroups,
    enabled,
    queryFn: () => api.get<CategoryGroupsResponse>("/v1/category-groups"),
    select: (d) => d.groups,
  });
}
