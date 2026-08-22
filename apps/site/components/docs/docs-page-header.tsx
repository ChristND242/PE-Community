export function DocsPageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description: string }) {
  return (
    <header className="mb-11 border-b border-white/[0.06] pb-10">
      {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/72">{eyebrow}</p>}
      <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white md:text-5xl">{title}</h1>
      <p className="mt-5 max-w-3xl text-base leading-8 text-white/60 md:text-[17px]">{description}</p>
    </header>
  );
}
