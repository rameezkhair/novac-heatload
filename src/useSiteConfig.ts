/* the site configuration as React state, kept apart from siteConfig.ts so the landing page loads it without React */
import { useSyncExternalStore } from 'react';
import { currentSiteConfig, isAdmin, shownOf, subscribeSiteConfig } from './siteConfig';

export const useSiteConfig = () => useSyncExternalStore(subscribeSiteConfig, currentSiteConfig, currentSiteConfig);
/* whether drafts show as previews (the admin is logged in in this browser) */
export const useAdminPreview = () => useSyncExternalStore(subscribeSiteConfig, isAdmin, isAdmin);
/* whether this visitor can use a feature: live, or a draft the admin is previewing */
export function useFeature(id: string) { const s = shownOf(useSiteConfig(), id, useAdminPreview()); return s === 'live' || s === 'preview'; }
