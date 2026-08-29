'use client';

import { CommunityFeedView } from '../../../components/community-feed-view';
import { AppShell } from '../../../components/shell';

export default function FeedPage() {
  return (
    <AppShell>
      <CommunityFeedView />
    </AppShell>
  );
}
