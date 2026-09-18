import type { ReactNode } from 'react';

export type HeroView = 'Dashboard' | 'Tasks' | 'Messages' | 'Production' | 'Planets' | 'Research' | 'Platforms' | 'Energy' | 'Logistics' | 'Probes' | 'Goals' | 'Achievements' | 'Report' | 'Activity' | 'Profiles' | 'Server';

const heroMeta: Record<HeroView, { asset: string; sectionId: string }> = {
  Dashboard: { asset: 'dashboard', sectionId: 'SYS–01' },
  Tasks: { asset: 'tasks', sectionId: 'WORK–02' },
  Messages: { asset: 'messages', sectionId: 'COMMS–03' },
  Production: { asset: 'production', sectionId: 'PROD–04' },
  Planets: { asset: 'planets', sectionId: 'ORBIT–05' },
  Research: { asset: 'research', sectionId: 'LAB–06' },
  Platforms: { asset: 'platforms', sectionId: 'FLIGHT–07' },
  Energy: { asset: 'energy', sectionId: 'GRID–08' },
  Logistics: { asset: 'logistics', sectionId: 'NET–09' },
  Probes: { asset: 'probes', sectionId: 'SIGNAL–10' },
  Goals: { asset: 'goals', sectionId: 'TARGET–11' },
  Achievements: { asset: 'achievements', sectionId: 'RECORD–12' },
  Report: { asset: 'report', sectionId: 'SHIFT–13' },
  Activity: { asset: 'activity', sectionId: 'EVENT–14' },
  Profiles: { asset: 'profiles', sectionId: 'OPERATOR–15' },
  Server: { asset: 'server', sectionId: 'CORE–16' }
};

export function PageHero({ view, eyebrow, title, description, actions, density = 'standard' }: {
  view: HeroView;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  density?: 'compact' | 'standard' | 'spacious';
}) {
  const { asset, sectionId } = heroMeta[view];
  const titleId = `page-title-${asset}`;
  return <header className={`page-hero density-${density}`} aria-labelledby={titleId}>
    <picture className="page-hero-art" aria-hidden="true">
      <source media="(max-width: 640px)" srcSet={`/heroes/${asset}-800.webp`} />
      <img src={`/heroes/${asset}-1600.webp`} srcSet={`/heroes/${asset}-800.webp 800w, /heroes/${asset}-1600.webp 1600w`} sizes="(max-width: 860px) 100vw, calc(100vw - 252px)" alt="" loading="eager" decoding="async" fetchPriority="high" />
    </picture>
    <div className="page-hero-overlay" aria-hidden="true" />
    <div className="page-hero-content">
      <p className="page-hero-kicker"><span>{sectionId}</span><i />{eyebrow}</p>
      <h1 id={titleId}>{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}
