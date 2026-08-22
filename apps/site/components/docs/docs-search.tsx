'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { searchDocs } from '../../lib/docs/search';
import { useI18n } from '../../lib/i18n';

export function DocsSearch() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { lang } = useI18n();
  const labels = lang === 'fr'
    ? { placeholder: 'Rechercher dans les docs', empty: 'Aucune page de documentation ne correspond à cette recherche.' }
    : { placeholder: 'Search docs', empty: 'No docs pages match that search.' };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const results = useMemo(() => searchDocs(query, lang).slice(0, 6), [lang, query]);

  useEffect(() => setActiveIndex(-1), [query, lang]);

  function goTo(href: string) {
    setQuery('');
    setFocused(false);
    router.push(href);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setFocused(false);
      inputRef.current?.blur();
      return;
    }
    if (!results.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter') {
      const selected = results[activeIndex];
      if (selected) goTo(selected.href);
      return;
    }
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    setActiveIndex((current) => (current + direction + results.length) % results.length);
  }

  return (
    <div className="relative w-full max-w-[420px]">
      <div className="docs-search-control flex h-[42px] items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-white/50 transition focus-within:border-emerald-300/20 hover:border-white/[0.12]">
        <Search size={17} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onSearchKeyDown}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          aria-autocomplete="list"
          aria-controls="docs-search-results"
          aria-expanded={focused && Boolean(query.trim())}
          aria-activedescendant={activeIndex >= 0 ? `docs-search-result-${activeIndex}` : undefined}
          role="combobox"
          className="min-w-0 flex-1 bg-transparent text-sm text-white/88 outline-none placeholder:text-white/32"
        />
        <span className="hidden rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-semibold text-white/35 sm:inline">Ctrl K</span>
      </div>
      {focused && query.trim() && (
        <div id="docs-search-results" role="listbox" className="docs-search-results absolute left-0 right-0 top-[3rem] z-50 max-h-[min(24rem,calc(100vh-6rem))] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0a0f0d] shadow-2xl shadow-black/40 [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin]">
          {results.length ? results.map((item, index) => (
            <button id={`docs-search-result-${index}`} role="option" aria-selected={activeIndex === index} key={item.href} type="button" onMouseDown={() => goTo(item.href)} onMouseEnter={() => setActiveIndex(index)} className="block w-full border-b border-white/[0.06] px-4 py-3 text-left last:border-b-0 hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none aria-selected:bg-white/[0.04]">
              <span className="block text-sm font-semibold text-white">{item.title}</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/45">{item.category}</span>
              {item.description && <span className="mt-1 block text-xs leading-5 text-white/48">{item.description}</span>}
            </button>
          )) : <p className="px-4 py-4 text-sm text-white/45">{labels.empty}</p>}
        </div>
      )}
    </div>
  );
}
