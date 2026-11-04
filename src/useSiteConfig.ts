/* the site configuration as React state, kept apart from siteConfig.ts so the landing page loads it without React */
import { useSyncExternalStore } from 'react';
import { currentSiteConfig, currentUser, isAdmin, shownOf, subscribeSiteConfig } from './siteConfig';

export const useSiteConfig = () => useSyncExternalStore(subscribeSiteConfig, currentSiteConfig, currentSiteConfig);
/* whether drafts show as previews (the admin is logged in in this browser) */
export const useAdminPreview = () => useSyncExternalStore(subscribeSiteConfig, isAdmin, isAdmin);
/* the logged-in user, or null */
export const useUser = () => useSyncExternalStore(subscribeSiteConfig, currentUser, currentUser);
/* whether this visitor can use a feature: live, a draft the admin is previewing, or locked and the user has Pro */
export function useFeature(id: string) { const s = shownOf(useSiteConfig(), id, useAdminPreview(), !!useUser()?.pro); return s === 'live' || s === 'preview'; }
