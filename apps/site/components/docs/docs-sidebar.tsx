'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDocsNavigation } from '../../lib/docs/navigation';
import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/utils';

export function DocsSidebar() {
  const pathname = usePathname();
  const { lang } = useI18n();
  const navigation = getDocsNavigation(lang);
  return (
    <aside className="docs-sidebar sticky top-16 hidden h-[calc(100vh-64px)] w-[300px] shrink-0 overflow-y-auto border-r border-white/[0.06] bg-[#08110e]/74 px-5 py-6 [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin] lg:block">
      <nav className="grid gap-7">
        {navigation.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/32">{group.title}</p>
            <div className="grid gap-1">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[38px] items-center rounded-xl border border-transparent px-3 py-2 text-sm transition',
                      active ? 'border-emerald-300/[0.12] bg-emerald-400/[0.09] text-emerald-50' : 'text-white/58 hover:bg-white/[0.045] hover:text-white/80',
                    )}
                  >
                    {item.title}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
