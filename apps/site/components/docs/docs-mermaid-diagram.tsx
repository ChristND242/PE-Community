import { MermaidDiagram } from '../mermaid-diagram';

export function DocsMermaidDiagram({
  title,
  description,
  source,
  unavailableLabel,
}: {
  title: string;
  description: string;
  source: string;
  unavailableLabel: string;
}) {
  return (
    <MermaidDiagram
      title={title}
      description={description}
      source={source}
      unavailableLabel={unavailableLabel}
      presentation="docs"
    />
  );
}
