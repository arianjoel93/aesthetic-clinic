import { apiRequest } from "./api";
import type { Customer, CustomerPayload } from "../types/customer";

export const customerService = {
  list(params?: { search?: string; status_id?: number | null }) {
    return apiRequest<Customer[]>("/customers", { params });
  },
  get(id: number) {
    return apiRequest<Customer>(`/customers/${id}`);
  },
  create(payload: CustomerPayload) {
    return apiRequest<Customer>("/customers", { method: "POST", body: JSON.stringify(payload) });
  },
  update(id: number, payload: Partial<CustomerPayload>) {
    return apiRequest<Customer>(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  remove(id: number) {
    return apiRequest<{ message: string }>(`/customers/${id}`, { method: "DELETE" });
  },
};
