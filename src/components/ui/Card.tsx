import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("rounded-2xl border border-stone-200/90 bg-white/90 p-4 shadow-[0_20px_60px_rgba(57,50,38,0.08)] backdrop-blur sm:p-5", className)} {...props} />; }
