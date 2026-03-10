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
        <div className="h-7 w-28 animate-pulse rounded bg-shell-strong" />
        <div className="h-5 w-36 animate-pulse rounded bg-shell-strong" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="h-[4.5rem] animate-pulse rounded-[1rem] bg-shell-strong" />
          <div className="h-[4.5rem] animate-pulse rounded-[1rem] bg-shell-strong" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 bg-card-strong">
      <div className="space-y-1.5">
        <h2 className="text-[var(--font-title-section)] font-semibold tracking-[-0.05em] text-ink">
          {profile?.name || '校园用户'}
        </h2>
        <p className="text-base text-muted">
          {profile?.studentId || '学号待同步'}
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-[1rem] bg-white/78 px-3.5 py-3 ring-1 ring-line">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">班级</p>
          <p className="mt-1.5 text-sm font-medium leading-6 text-ink">
            {profile?.className || '待同步'}
          </p>
        </div>
        <div className="rounded-[1rem] bg-white/78 px-3.5 py-3 ring-1 ring-line">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">身份</p>
          <p className="mt-1.5 text-sm font-medium leading-6 text-ink">
            {profile?.identity || '校园用户'}
          </p>
        </div>
      </div>
    </Card>
  );
}
