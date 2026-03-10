import type { UserProfile } from '@/entities/user/model/user-types';
import { Card } from '@/shared/ui/card';

interface ProfileSummaryProps {
  loading?: boolean;
  profile: UserProfile | null;
}

export function ProfileSummary({ loading = false, profile }: ProfileSummaryProps) {
  if (loading) {
    return (
      <Card className="space-y-3 bg-card-strong">
        <div className="h-8 w-28 animate-pulse rounded bg-shell-strong" />
        <div className="h-6 w-40 animate-pulse rounded bg-shell-strong" />
      </Card>
    );
  }

  return (
    <Card className="space-y-2 bg-card-strong">
      <h2 className="text-[2rem] font-semibold tracking-[-0.05em] text-ink">
        {profile?.name || '校园用户'}
      </h2>
      <p className="text-lg text-muted">
        {profile?.studentId || '学号待同步'}
      </p>
    </Card>
  );
}
