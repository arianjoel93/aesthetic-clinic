import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes/router";
import "./styles.css";

if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
  const obsoleteKeys = ["crm-app-basic-storage", "crm_local_services", "crm_pos_pin_hash", "crm-auth"];
  obsoleteKeys.forEach((key) => localStorage.removeItem(key));
  Object.keys(localStorage)
    .filter((key) => key.startsWith("crm_setting_") || key.startsWith("crm_supabase_source_cleanup_"))
    .forEach((key) => localStorage.removeItem(key));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
