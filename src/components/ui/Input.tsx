import type { InputHTMLAttributes } from "react";
import { cn } from "../../utils/cn";
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn("w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-stone-700", className)} {...props} />; }
