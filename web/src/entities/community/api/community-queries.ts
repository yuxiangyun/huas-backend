/**
 * [INPUT]: 依赖 Community HTTP adapter、全部 Social 作者读模型查询键与 TanStack Query
 * [OUTPUT]: 对外提供当前资料查询、资料更新与头像清除 hooks
 * [POS]: entities/community 的缓存编排层，写入后刷新内容、消息和通知中的公共作者投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearCommunityAvatar,
  getCommunityUser,
  getCurrentCommunityProfile,
  updateCommunityProfile,
} from '@/entities/community/api/community-api';
import { communityQueryKeys } from '@/entities/community/model/community-query-keys';
import { discoverQueryKeys } from '@/entities/discover/model/discover-query-keys';
import { treeholeQueryKeys } from '@/entities/treehole/model/treehole-query-keys';
import { messagingQueryKeys } from '@/entities/messaging/model/messaging-query-keys';
import { notificationQueryKeys } from '@/entities/notifications/model/notification-query-keys';

function invalidateSocialAuthors(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: discoverQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: messagingQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
}

function cacheUpdatedProfile(
  queryClient: ReturnType<typeof useQueryClient>,
  profile: Awaited<ReturnType<typeof updateCommunityProfile>>
) {
  queryClient.setQueryData(communityQueryKeys.profile(), profile);
  queryClient.setQueryData(communityQueryKeys.user(profile.id), {
    id: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  });
  invalidateSocialAuthors(queryClient);
}

export function useCommunityProfileQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: communityQueryKeys.profile(),
    queryFn: ({ signal }) => getCurrentCommunityProfile({ signal }),
    enabled: options?.enabled ?? true,
  });
}

export function useCommunityUserQuery(userId: number | null) {
  return useQuery({
    queryKey: communityQueryKeys.user(userId ?? 0),
    queryFn: ({ signal }) => getCommunityUser(userId!, { signal }),
    enabled: userId !== null,
  });
}

export function useUpdateCommunityProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCommunityProfile,
    onSuccess: (profile) => {
      cacheUpdatedProfile(queryClient, profile);
    },
  });
}

export function useClearCommunityAvatarMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearCommunityAvatar,
    onSuccess: (profile) => {
      cacheUpdatedProfile(queryClient, profile);
    },
  });
}
