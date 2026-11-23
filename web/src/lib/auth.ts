import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  user: AuthUser;
}

interface AuthInput {
  email: string;
  password: string;
  name?: string;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => unwrap<AuthUser>(await api.get("/api/v1/auth/me")),
    retry: false,
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (input: AuthInput) => {
      const res = await api.post<ApiEnvelope<AuthResponse>>(
        "/api/v1/auth/register",
        { name: input.name, email: input.email, password: input.password },
      );
      return res.data;
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<AuthInput, "name">) => {
      const res = await api.post<ApiEnvelope<AuthResponse>>(
        "/api/v1/auth/login",
        input,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.post("/api/v1/auth/logout"),
    onSuccess: () => {
      // Bersihkan seluruh cache client (termasuk ["me"]) supaya tidak ada
      // state auth basi, lalu ke halaman login — bukan "/" (home adalah
      // protected page yang akan melempar balik ke /login).
      qc.clear();
      window.location.href = "/login";
    },
    onError: () => {
      // Walau API logout gagal, tetap buang state client agar tidak
      // tersangkut di halaman protected.
      qc.clear();
      window.location.href = "/login";
    },
  });
}
