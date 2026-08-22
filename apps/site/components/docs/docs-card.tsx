import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function DocsCard({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <Link href={href} className="docs-card group rounded-2xl border border-white/[0.065] bg-white/[0.028] p-5 transition hover:border-emerald-300/[0.18] hover:bg-white/[0.045] focus:border-emerald-300/[0.2] focus:outline-none">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-white">{title}</h3>
        <ArrowRight className="mt-0.5 h-4 w-4 text-white/28 transition group-hover:translate-x-0.5 group-hover:text-emerald-200/80" />
      </div>
      <p className="mt-3 text-sm leading-6 text-white/56">{body}</p>
    </Link>
  );
}
