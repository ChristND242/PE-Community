export function DocsSectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-28 text-2xl font-semibold leading-tight tracking-[-0.03em] text-white md:text-3xl">
      {children}
    </h2>
  );
}
