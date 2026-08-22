import { ExternalLink } from 'lucide-react';
import { profileLinkDefinition, type ProfileLinkDto } from '../lib/profile-links';

export function ProfileLinkDisplay({ links, labels, openLabel }: { links: ProfileLinkDto[]; labels: Record<string, string>; openLabel: (platform: string) => string }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => {
        const Icon = profileLinkDefinition(link.platform).icon ?? ExternalLink;
        const label = link.label || labels[link.platform] || link.platform;
        const className = 'grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--app-icon-muted)] transition hover:border-emerald-500/30 hover:bg-[var(--app-interactive-open)] hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:text-white/55 dark:hover:border-emerald-300/25 dark:hover:bg-emerald-300/10 dark:hover:text-emerald-200';
        const icon = <Icon className="h-4 w-4" aria-hidden="true" />;
        return link.href ? <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer nofollow" aria-label={openLabel(label)} title={`${label}: ${link.displayValue}`} className={className}>{icon}</a> : <span key={link.id} aria-label={`${label}: ${link.displayValue}`} title={`${label}: ${link.displayValue}`} className={className}>{icon}</span>;
      })}
    </div>
  );
}
