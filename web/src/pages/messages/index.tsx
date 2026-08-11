/**
 * [INPUT]: 依赖消息中心、合规阻断 TaskDialog、活动通知逐条已读与 React Router 查询参数
 * [OUTPUT]: 对外提供 MessagesPage，默认展示互动通知，以显式 tab=conversations 选择私信，并在具体聊天加载前阻断 userId 目标
 * [POS]: pages/messages 的路由级组装器，只持有目标用户 URL 状态，在聊天加载前终止进入行为并负责原内容导航
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
import { LazyTaskFallback } from '@/shared/ui/lazy-task-fallback';
import { TaskDialog } from '@/shared/ui/task-dialog';
import { MessageCenter, type MessageSection } from '@/widgets/message-center/message-center';
import { useSocialShellContext } from '@/widgets/mobile-tab-shell/mobile-tab-shell';

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
  const { unreadSummary, unreadSummaryReady } = useSocialShellContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const markReadMutation = useMarkNotificationReadMutation();
  const section: MessageSection = searchParams.get('tab') === 'conversations' ? 'conversations' : 'notifications';
  const userId = positiveId(searchParams.get('userId'));
  const profileUserId = positiveId(searchParams.get('profileUserId'));
  const [profileDialogRequested, setProfileDialogRequested] = useState(false);

  useEffect(() => setActiveTab('messages'), [setActiveTab]);

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
    patchSearchParams((params) => {
      selectMessageTarget(params, conversation.otherUser.id);
      params.set('tab', 'conversations');
    });
  };

  function returnFromUnavailableChat() {
    const historyIndex = window.history.state?.idx;

    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
      return;
    }

    patchSearchParams((params) => {
      params.delete('conversationId');
      params.delete('userId');
    });
  }

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
        pollingPaused={userId !== null}
        unreadSummary={unreadSummary}
        unreadSummaryReady={unreadSummaryReady}
        onSectionChange={(nextSection) => patchSearchParams((params) => {
          if (nextSection === 'notifications') params.set('tab', 'notifications');
          else params.set('tab', 'conversations');
        })}
      />
      {userId !== null ? (
        <TaskDialog
          closeLabel="返回上一界面"
          dismissible={false}
          open={userId !== null}
          presentation="modal"
          title="私信暂不开放"
          onClose={returnFromUnavailableChat}
        >
          <p className="text-sm leading-6 text-muted">
            由于合规要求，私信功能暂不开放。
          </p>
        </TaskDialog>
      ) : null}
      {profileDialogRequested ? (
        <Suspense fallback={profileUserId !== null ? <LazyTaskFallback label="用户资料" /> : null}>
          <LazyPublicProfileDialog
            userId={profileUserId}
            onClose={() => patchSearchParams((params) => params.delete('profileUserId'))}
            onMessage={(nextUserId) => patchSearchParams((params) => {
              selectMessageTarget(params, nextUserId);
              params.delete('profileUserId');
              params.set('tab', 'conversations');
            })}
            onOpenDiscoverPost={(postId) => navigate(`${appRoutes.discover}?postId=${postId}`)}
            onOpenTreeholePost={(postId) => navigate(`${appRoutes.treehole}?postId=${postId}`)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
