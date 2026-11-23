import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import type {
  CheckoutResponse,
  Meme,
  Plan,
  SubscriptionStatus,
  UploadResponse,
} from "@/lib/types";

export const queryKeys = {
  plans: ["plans"] as const,
  subscription: ["subscription"] as const,
  memes: (limit: number, offset: number) => ["memes", limit, offset] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: queryKeys.plans,
    queryFn: async () =>
      unwrap<Plan[]>(await api.get("/api/v1/subscription/plans")) ?? [],
  });
}

export function useSubscriptionStatus() {
  return useQuery({
    queryKey: queryKeys.subscription,
    queryFn: async () =>
      unwrap<SubscriptionStatus>(await api.get("/api/v1/subscription/status")),
    // BUG: status dianggap abadi — setelah beli/expired, UI tidak pernah
    // mengambil ulang sampai invalidate manual / reload penuh.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// Idempotency key dibuat SEKALI per maksud checkout (per planCode) lalu
// dipakai ulang untuk semua retry/double-click, sehingga backend menganggap
// klik berulang sebagai permintaan yang sama.
const checkoutIdempotencyKeys = new Map<string, string>();

function getCheckoutIdempotencyKey(planCode: string): string {
  let key = checkoutIdempotencyKeys.get(planCode);
  if (!key) {
    key = crypto.randomUUID();
    checkoutIdempotencyKeys.set(planCode, key);
  }
  return key;
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (planCode: string) =>
      unwrap<CheckoutResponse>(
        await api.post("/api/v1/subscription/checkout", { planCode }, {
          headers: {
            "Idempotency-Key": getCheckoutIdempotencyKey(planCode),
          },
        }),
      ),
    onSuccess: (_data, planCode) => {
      // Checkout selesai — lepaskan key agar pembelian plan ini berikutnya
      // dianggap maksud baru.
      checkoutIdempotencyKeys.delete(planCode);
      qc.invalidateQueries({ queryKey: queryKeys.subscription });
    },
  });
}

export function useConfirmPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reference: string) =>
      unwrap(
        await api.post(
          `/api/v1/subscription/payments/${reference}/confirm`,
        ),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.subscription }),
  });
}

export function useMemes(limit = 20, offset = 0) {
  return useQuery({
    queryKey: queryKeys.memes(limit, offset),
    queryFn: async () =>
      unwrap<{ items: Meme[]; total: number }>(
        await api.get("/api/v1/memes", { params: { limit, offset } }),
      ),
  });
}

export function usePrepareUpload() {
  return useMutation({
    mutationFn: async (input: { title: string; filename: string }) =>
      unwrap<UploadResponse>(
        await api.post("/api/v1/memes/upload", input),
      ),
  });
}

export function useCompleteMeme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; resultUrl: string }) =>
      unwrap<Meme>(
        await api.post(`/api/v1/memes/${input.id}/complete`, {
          resultUrl: input.resultUrl,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memes"] }),
  });
}

export function useDeleteMeme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/api/v1/memes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memes"] }),
  });
}
