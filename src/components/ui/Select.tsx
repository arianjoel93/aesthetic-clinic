import type { SelectHTMLAttributes } from "react";
import { cn } from "../../utils/cn";
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn("w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-stone-700", className)} {...props} />; }
