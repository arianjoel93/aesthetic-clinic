import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/cn";
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn("min-h-28 w-full resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-stone-700", className)} {...props} />; }
