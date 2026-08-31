import { apiRequest } from "./api";
import type { Contact, ContactPayload } from "../types/contact";

export const contactService = {
  list(params?: { search?: string; customer_id?: number | null }) {
    return apiRequest<Contact[]>("/contacts", { params });
  },
  get(id: number) {
    return apiRequest<Contact>(`/contacts/${id}`);
  },
  create(payload: ContactPayload) {
    return apiRequest<Contact>("/contacts", { method: "POST", body: JSON.stringify(payload) });
  },
  update(id: number, payload: Partial<ContactPayload>) {
    return apiRequest<Contact>(`/contacts/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  remove(id: number) {
    return apiRequest<{ message: string }>(`/contacts/${id}`, { method: "DELETE" });
  },
};
