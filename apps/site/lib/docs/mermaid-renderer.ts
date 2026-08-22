import {
  getMermaidConfig,
  type DocsMermaidTheme,
  type MermaidPresentation,
} from './mermaid-config';

type MermaidRenderResult = {
  svg: string;
};

let renderQueue: Promise<void> = Promise.resolve();
let initializedConfig: `${DocsMermaidTheme}:${MermaidPresentation}` | null = null;

export function renderMermaid({
  id,
  source,
  theme,
  presentation,
}: {
  id: string;
  source: string;
  theme: DocsMermaidTheme;
  presentation: MermaidPresentation;
}): Promise<MermaidRenderResult> {
  const render = renderQueue.then(async () => {
    const { default: mermaid } = await import('mermaid');
    const configKey = `${theme}:${presentation}` as const;
    if (initializedConfig !== configKey) {
      mermaid.initialize(getMermaidConfig(theme, presentation));
      initializedConfig = configKey;
    }
    await mermaid.parse(source, { suppressErrors: false });
    const result = await mermaid.render(id, source);
    return { svg: result.svg };
  });

  renderQueue = render.then(
    () => undefined,
    () => undefined,
  );
  return render;
}

export function renderDocsMermaid(
  input: Omit<Parameters<typeof renderMermaid>[0], 'presentation'>,
) {
  return renderMermaid({ ...input, presentation: 'docs' });
}
