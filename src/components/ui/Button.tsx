import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/cn";
type Variant = "primary" | "secondary" | "ghost" | "danger";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; }
const variantClasses: Record<Variant, string> = { primary: "bg-stone-900 text-white hover:bg-stone-800", secondary: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50", ghost: "bg-transparent text-stone-700 hover:bg-stone-100", danger: "bg-red-700 text-white hover:bg-red-600" };
export function Button({ className, variant = "primary", ...props }: ButtonProps) { return <button className={cn("inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 sm:px-4", variantClasses[variant], className)} {...props} />; }
