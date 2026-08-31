import { apiRequest } from "./api";
import type { AuthResponse, User } from "../types/user";

export const authService = {
  login(payload: { email: string; password: string }) {
    return apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  register(payload: { email: string; full_name: string; password: string }) {
    return apiRequest<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  me() {
    return apiRequest<User>("/auth/me");
  },
};
