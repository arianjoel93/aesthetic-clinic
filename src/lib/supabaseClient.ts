import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const databaseActivityEvent = "crm-database-activity";

let activeDatabaseRequests = 0;
const nativeFetch = globalThis.fetch.bind(globalThis);

function notifyDatabaseActivity() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(databaseActivityEvent, {
    detail: { count: activeDatabaseRequests },
  }));
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

async function trackedSupabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  const method = getRequestMethod(input, init);
  const shouldTrack = ["GET", "HEAD"].includes(method) && getRequestUrl(input).includes("/rest/v1/");
  if (shouldTrack) {
    activeDatabaseRequests += 1;
    notifyDatabaseActivity();
  }
  try {
    return await nativeFetch(input, init);
  } finally {
    if (shouldTrack) {
      activeDatabaseRequests = Math.max(0, activeDatabaseRequests - 1);
      notifyDatabaseActivity();
    }
  }
}

export function getActiveDatabaseRequestCount() {
  return activeDatabaseRequests;
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { fetch: trackedSupabaseFetch },
  })
  : null;
