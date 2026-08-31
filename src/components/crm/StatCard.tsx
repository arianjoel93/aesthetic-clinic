import { Card } from "../ui/Card";
interface StatCardProps { label: string; value: string; note: string; }
export function StatCard({ label, value, note }: StatCardProps) { return <Card><p className="text-xs font-bold uppercase tracking-[0.22em] text-stone-500">{label}</p><p className="mt-4 text-4xl font-black tracking-tight text-stone-950">{value}</p><p className="mt-3 text-sm text-stone-600">{note}</p></Card>; }
