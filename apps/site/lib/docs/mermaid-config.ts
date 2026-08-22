import type { MermaidConfig } from 'mermaid';

export type DocsMermaidTheme = 'light' | 'dark';
export type MermaidPresentation = 'docs' | 'marketing';

const sharedConfig = {
  startOnLoad: false,
  suppressErrorRendering: true,
  securityLevel: 'strict',
  theme: 'base',
  deterministicIds: true,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  flowchart: {
    curve: 'basis',
    htmlLabels: false,
    useMaxWidth: true,
  },
  sequence: {
    useMaxWidth: true,
    wrap: true,
    actorMargin: 42,
    messageMargin: 34,
  },
} satisfies MermaidConfig;

const themeVariables: Record<DocsMermaidTheme, MermaidConfig['themeVariables']> = {
  light: {
    background: '#f6faf7',
    primaryColor: '#edf6f0',
    primaryTextColor: '#17352a',
    primaryBorderColor: '#18865f',
    secondaryColor: '#dcebe1',
    secondaryTextColor: '#17352a',
    secondaryBorderColor: '#62a88b',
    tertiaryColor: '#f8fbf9',
    tertiaryTextColor: '#17352a',
    tertiaryBorderColor: '#9abdad',
    lineColor: '#18865f',
    textColor: '#17352a',
    mainBkg: '#edf6f0',
    nodeBorder: '#18865f',
    clusterBkg: '#f8fbf9',
    clusterBorder: '#9abdad',
    edgeLabelBackground: '#f6faf7',
    actorBkg: '#edf6f0',
    actorBorder: '#18865f',
    actorTextColor: '#17352a',
    actorLineColor: '#62a88b',
    signalColor: '#28664f',
    signalTextColor: '#17352a',
    labelBoxBkgColor: '#edf6f0',
    labelBoxBorderColor: '#62a88b',
    labelTextColor: '#17352a',
    loopTextColor: '#17352a',
    noteBkgColor: '#dcebe1',
    noteBorderColor: '#62a88b',
    noteTextColor: '#17352a',
  },
  dark: {
    background: '#07110d',
    primaryColor: '#10241b',
    primaryTextColor: '#f2fbf6',
    primaryBorderColor: '#5ed29c',
    secondaryColor: '#173126',
    secondaryTextColor: '#f2fbf6',
    secondaryBorderColor: '#3b8f69',
    tertiaryColor: '#0b1913',
    tertiaryTextColor: '#f2fbf6',
    tertiaryBorderColor: '#315f4b',
    lineColor: '#5ed29c',
    textColor: '#f2fbf6',
    mainBkg: '#10241b',
    nodeBorder: '#5ed29c',
    clusterBkg: '#0b1913',
    clusterBorder: '#315f4b',
    edgeLabelBackground: '#07110d',
    actorBkg: '#10241b',
    actorBorder: '#5ed29c',
    actorTextColor: '#f2fbf6',
    actorLineColor: '#3b8f69',
    signalColor: '#8ce7b8',
    signalTextColor: '#f2fbf6',
    labelBoxBkgColor: '#10241b',
    labelBoxBorderColor: '#3b8f69',
    labelTextColor: '#f2fbf6',
    loopTextColor: '#f2fbf6',
    noteBkgColor: '#173126',
    noteBorderColor: '#3b8f69',
    noteTextColor: '#f2fbf6',
  },
};

const marketingThemeVariables: Record<
  DocsMermaidTheme,
  MermaidConfig['themeVariables']
> = {
  light: {
    background: '#eef5f0',
    fontSize: '16px',
    primaryColor: '#fbfdfb',
    primaryTextColor: '#18372b',
    primaryBorderColor: '#4f8f73',
    secondaryColor: '#e0ece4',
    secondaryTextColor: '#18372b',
    secondaryBorderColor: '#7da990',
    tertiaryColor: '#e7f1ea',
    tertiaryTextColor: '#18372b',
    tertiaryBorderColor: '#5d957b',
    lineColor: '#4f806c',
    textColor: '#18372b',
    mainBkg: '#fbfdfb',
    nodeBorder: '#4f8f73',
    clusterBkg: '#dfece3',
    clusterBorder: '#2d795b',
    edgeLabelBackground: '#eef5f0',
  },
  dark: {
    background: '#07110d',
    fontSize: '16px',
    primaryColor: '#10221a',
    primaryTextColor: '#f1faf5',
    primaryBorderColor: '#4da67c',
    secondaryColor: '#173027',
    secondaryTextColor: '#f1faf5',
    secondaryBorderColor: '#397a5d',
    tertiaryColor: '#0c1b15',
    tertiaryTextColor: '#f1faf5',
    tertiaryBorderColor: '#315f4b',
    lineColor: '#4da67c',
    textColor: '#f1faf5',
    mainBkg: '#10221a',
    nodeBorder: '#4da67c',
    clusterBkg: '#0b1d15',
    clusterBorder: '#4da67c',
    edgeLabelBackground: '#07110d',
  },
};

export function getDocsMermaidConfig(theme: DocsMermaidTheme): MermaidConfig {
  return getMermaidConfig(theme, 'docs');
}

export function getMermaidConfig(
  theme: DocsMermaidTheme,
  presentation: MermaidPresentation,
): MermaidConfig {
  const flowchart =
    presentation === 'marketing'
      ? {
          ...sharedConfig.flowchart,
          curve: 'linear' as const,
          diagramPadding: 2,
          nodeSpacing: 54,
          rankSpacing: 38,
          padding: 20,
          subGraphTitleMargin: {
            top: 10,
            bottom: 14,
          },
          wrappingWidth: 132,
        }
      : sharedConfig.flowchart;

  return {
    ...sharedConfig,
    flowchart,
    themeVariables:
      presentation === 'marketing'
        ? marketingThemeVariables[theme]
        : themeVariables[theme],
  };
}
