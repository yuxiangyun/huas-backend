/**
 * [INPUT]: 依赖消息中心、按需聊天弹层、活动通知逐条已读与 React Router 查询参数
 * [OUTPUT]: 对外提供 MessagesPage，以 userId 唯一深链编排私信/互动分段、按需加载聊天及原内容导航
 * [POS]: pages/messages 的路由级组装器，只持有目标用户 URL 状态并把聊天代码推迟到真实会话意图后，会话 ID 由 Messaging 定位结果拥有
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useUiStore } from '@/app/state/ui-store';
import type { Conversation } from '@/entities/messaging/model/messaging-types';
import { useMarkNotificationReadMutation } from '@/entities/notifications/api/notification-queries';
import type { ActivityNotification } from '@/entities/notifications/model/notification-types';
import { selectMessageTarget } from '@/pages/social-route-state';
import { MessageCenter, type MessageSection } from '@/widgets/message-center/message-center';

const loadChatSheet = () => import('@/widgets/chat-sheet/chat-sheet');
const LazyChatSheet = lazy(async () => {
  const module = await loadChatSheet();
  return { default: module.ChatSheet };
});

const loadPublicProfileDialog = () => import('@/widgets/public-profile-dialog/public-profile-dialog');
const LazyPublicProfileDialog = lazy(async () => {
  const module = await loadPublicProfileDialog();
  return { default: module.PublicProfileDialog };
});

function positiveId(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function MessagesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const markReadMutation = useMarkNotificationReadMutation();
  const section: MessageSection = searchParams.get('tab') === 'notifications' ? 'notifications' : 'conversations';
  const userId = positiveId(searchParams.get('userId'));
  const profileUserId = positiveId(searchParams.get('profileUserId'));
  const [profileDialogRequested, setProfileDialogRequested] = useState(false);

  useEffect(() => setActiveTab('messages'), [setActiveTab]);

  useEffect(() => {
    if (userId === null) return;
    void loadChatSheet();
  }, [userId]);

  useEffect(() => {
    if (profileUserId === null) return;
    setProfileDialogRequested(true);
    void loadPublicProfileDialog();
  }, [profileUserId]);

  function patchSearchParams(patcher: (params: URLSearchParams) => void) {
    startTransition(() => {
      const next = new URLSearchParams(searchParams);
      patcher(next);
      setSearchParams(next);
    });
  }

  const openConversation = (conversation: Conversation) => {
    void loadChatSheet();
    patchSearchParams((params) => {
      selectMessageTarget(params, conversation.otherUser.id);
      params.delete('tab');
    });
  };

  const openNotification = (notification: ActivityNotification) => {
    if (!notification.readAt) {
      markReadMutation.mutate({ notificationId: notification.id });
    }
    const route = notification.resourceType === 'discover_post' ? appRoutes.discover : appRoutes.treehole;
    navigate(`${route}?postId=${notification.resourceId}`);
  };

  const openProfile = (nextUserId: number) => {
    setProfileDialogRequested(true);
    void loadPublicProfileDialog();
    patchSearchParams((params) => params.set('profileUserId', String(nextUserId)));
  };

  return (
    <>
      <MessageCenter
        section={section}
        onOpenConversation={openConversation}
        onOpenNotification={openNotification}
        onOpenProfile={openProfile}
        onSectionChange={(nextSection) => patchSearchParams((params) => {
          if (nextSection === 'notifications') params.set('tab', 'notifications');
          else params.delete('tab');
        })}
      />
      {userId !== null ? (
        <Suspense fallback={null}>
          <LazyChatSheet
            userId={userId}
            onClose={() => patchSearchParams((params) => {
              params.delete('conversationId');
              params.delete('userId');
            })}
            onOpenProfile={openProfile}
          />
        </Suspense>
      ) : null}
      {profileDialogRequested ? (
        <Suspense fallback={null}>
          <LazyPublicProfileDialog
            userId={profileUserId}
            onClose={() => patchSearchParams((params) => params.delete('profileUserId'))}
            onMessage={(nextUserId) => patchSearchParams((params) => {
              void loadChatSheet();
              selectMessageTarget(params, nextUserId);
              params.delete('profileUserId');
              params.delete('tab');
            })}
            onOpenDiscoverPost={(postId) => navigate(`${appRoutes.discover}?postId=${postId}`)}
            onOpenTreeholePost={(postId) => navigate(`${appRoutes.treehole}?postId=${postId}`)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
