/**
 * [INPUT]: 依赖 Messaging 用户目标定位、历史/增量/发送/已读 hooks、TaskDialog、动作菜单与私有媒体原语
 * [OUTPUT]: 对外提供 ChatSheet，以稳定滚动的浅色对话基底支持 userId 唯一定位、空会话首发、分组图文气泡、历史分页和实时增量
 * [POS]: widgets/chat-sheet 的私信任务容器，只持有目标用户范围内的编辑、消息与贴底阅读状态，不接受独立会话事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ChangeEvent, KeyboardEvent } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Send, X } from 'lucide-react';
import {
  useConversationTargetQuery,
  useMarkConversationReadMutation,
  useMessageChangesQuery,
  useMessagesInfiniteQuery,
  useSendMessageMutation,
} from '@/entities/messaging/api/messaging-queries';
import type { Message } from '@/entities/messaging/model/messaging-types';
import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { EmptyState } from '@/shared/ui/empty-state';
import { PrivateMediaImage } from '@/shared/ui/private-media-image';
import { TaskDialog } from '@/shared/ui/task-dialog';

const MAX_IMAGES = 9;
const MAX_TEXT_LENGTH = 1_000;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 64 * 1024 * 1024;
const MESSAGE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.avif,.tif,.tiff';

interface ImageDraft {
  file: File;
  previewUrl: string;
}

interface SendAttempt {
  clientMessageId: string;
  text: string;
  files: File[];
}

interface ChatSheetProps {
  userId: number | null;
  onClose: () => void;
  onOpenProfile: (userId: number) => void;
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calendarDay(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatMessageDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (calendarDay(value) === calendarDay(today.toISOString())) return '今天';
  if (calendarDay(value) === calendarDay(yesterday.toISOString())) return '昨天';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

type BubbleGroupPosition = 'single' | 'first' | 'middle' | 'last';

function isSameGroup(left: Message | undefined, right: Message) {
  return left?.sender.id === right.sender.id && calendarDay(left.createdAt) === calendarDay(right.createdAt);
}

function bubbleGroupPosition(messages: Message[], index: number): BubbleGroupPosition {
  const message = messages[index];
  const samePrevious = isSameGroup(messages[index - 1], message);
  const sameNext = isSameGroup(messages[index + 1], message);
  if (!samePrevious && !sameNext) return 'single';
  if (!samePrevious && sameNext) return 'first';
  if (samePrevious && sameNext) return 'middle';
  return 'last';
}

function bubbleShapeClass(incoming: boolean, position: BubbleGroupPosition) {
  if (incoming) {
    if (position === 'first') return 'rounded-[18px] rounded-bl-[7px]';
    if (position === 'middle') return 'rounded-[18px] rounded-l-[7px]';
    return 'rounded-[18px] rounded-tl-[7px] rounded-bl-[4px]';
  }
  if (position === 'first') return 'rounded-[18px] rounded-br-[7px]';
  if (position === 'middle') return 'rounded-[18px] rounded-r-[7px]';
  return 'rounded-[18px] rounded-tr-[7px] rounded-br-[4px]';
}

function bubbleTailClass(incoming: boolean, hasTail: boolean) {
  if (!hasTail) return '';
  return incoming
    ? "after:absolute after:bottom-0 after:-left-[6px] after:size-0 after:border-r-[8px] after:border-t-[8px] after:border-r-[#f1f2f4] after:border-t-transparent after:content-['']"
    : "after:absolute after:bottom-0 after:-right-[6px] after:size-0 after:border-l-[8px] after:border-t-[8px] after:border-l-[#2aabee] after:border-t-transparent after:content-['']";
}

function mergeMessages(base: Message[], changes: ReadonlyMap<number, Message>) {
  const merged = new Map(base.map((item) => [item.id, item]));
  changes.forEach((item, id) => merged.set(id, item));
  return [...merged.values()].sort((left, right) => left.id - right.id);
}

export function ChatSheet({ userId, onClose, onOpenProfile }: ChatSheetProps) {
  const targetQuery = useConversationTargetQuery(userId);
  const effectiveConversationId = targetQuery.data?.conversationId ?? null;
  const messagesQuery = useMessagesInfiniteQuery(effectiveConversationId);
  const sendMutation = useSendMessageMutation();
  const markReadMutation = useMarkConversationReadMutation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastMarkedReadRef = useRef(0);
  const previousLastMessageIdRef = useRef(0);
  const keepPinnedToBottomRef = useRef(true);
  const imagesRef = useRef<ImageDraft[]>([]);
  const sendAttemptRef = useRef<SendAttempt | null>(null);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<ImageDraft[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [messageWatermark, setMessageWatermark] = useState<number | null>(null);
  const [messageChanges, setMessageChanges] = useState<Map<number, Message>>(() => new Map());
  const messageChangesQuery = useMessageChangesQuery(effectiveConversationId, messageWatermark);
  const target = targetQuery.data?.profile ?? null;
  const baseMessages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    return [...pages].reverse().flatMap((page) => page.items);
  }, [messagesQuery.data]);
  const messages = useMemo(() => mergeMessages(baseMessages, messageChanges), [baseMessages, messageChanges]);
  const lastMessageId = messages.at(-1)?.id ?? 0;

  useEffect(() => {
    setDraft('');
    setImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
    setActionMessage(null);
    setMessageChanges(new Map());
    setMessageWatermark(null);
    lastMarkedReadRef.current = 0;
    previousLastMessageIdRef.current = 0;
    keepPinnedToBottomRef.current = true;
    sendAttemptRef.current = null;
  }, [userId]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => () => {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 110)}px`;
  }, [draft]);

  useEffect(() => {
    if (effectiveConversationId === null || !messagesQuery.isSuccess || messageWatermark !== null) return;
    setMessageWatermark(Math.max(0, ...baseMessages.map((message) => message.id)));
  }, [baseMessages, effectiveConversationId, messageWatermark, messagesQuery.isSuccess]);

  useEffect(() => {
    const data = messageChangesQuery.data;
    if (!data) return;
    if (data.items.length > 0) {
      setMessageChanges((current) => {
        const next = new Map(current);
        data.items.forEach((message) => next.set(message.id, message));
        return next;
      });
    }
    setMessageWatermark((current) => Math.max(current ?? 0, data.afterMessageId ?? 0));
  }, [messageChangesQuery.data]);

  useEffect(() => {
    if (!effectiveConversationId || lastMessageId <= lastMarkedReadRef.current) return;
    lastMarkedReadRef.current = lastMessageId;
    markReadMutation.mutate({ conversationId: effectiveConversationId, throughMessageId: lastMessageId });
  }, [effectiveConversationId, lastMessageId, markReadMutation]);

  useEffect(() => {
    if (lastMessageId === 0 || lastMessageId <= previousLastMessageIdRef.current) return;
    const initialPosition = previousLastMessageIdRef.current === 0;
    previousLastMessageIdRef.current = lastMessageId;
    if (!initialPosition && !keepPinnedToBottomRef.current) return;

    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({
        block: 'end',
        behavior: initialPosition || window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
    });
  }, [lastMessageId]);

  const loadEarlierMessages = async () => {
    const viewport = scrollViewportRef.current;
    const previousHeight = viewport?.scrollHeight ?? 0;
    const previousTop = viewport?.scrollTop ?? 0;
    await messagesQuery.fetchNextPage();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!viewport) return;
        viewport.scrollTop = previousTop + viewport.scrollHeight - previousHeight;
      });
    });
  };

  const removeImage = (index: number) => {
    setImages((current) => {
      const image = current[index];
      if (image) URL.revokeObjectURL(image.previewUrl);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const selectImages = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    const nextFiles = [...images.map((image) => image.file), ...selected];
    if (nextFiles.length > MAX_IMAGES) {
      setActionMessage(`每条消息最多发送 ${MAX_IMAGES} 张图片`);
      return;
    }
    if (selected.some((image) => image.size > MAX_IMAGE_BYTES)) {
      setActionMessage('单张图片不能超过 32MB');
      return;
    }
    if (nextFiles.reduce((total, image) => total + image.size, 0) > MAX_TOTAL_IMAGE_BYTES) {
      setActionMessage('图片总大小不能超过 64MB');
      return;
    }
    setActionMessage(null);
    setImages((current) => [
      ...current,
      ...selected.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
  };

  const submit = async () => {
    if (!userId || !target || (!draft.trim() && images.length === 0) || sendMutation.isPending) return;
    if (Array.from(draft.trim()).length > MAX_TEXT_LENGTH) {
      setActionMessage(`消息不能超过 ${MAX_TEXT_LENGTH} 个字符`);
      return;
    }

    const text = draft.trim();
    const files = images.map((image) => image.file);
    const previousAttempt = sendAttemptRef.current;
    const canRetry = previousAttempt
      && previousAttempt.text === text
      && previousAttempt.files.length === files.length
      && previousAttempt.files.every((file, index) => file === files[index]);
    const clientMessageId = canRetry ? previousAttempt.clientMessageId : crypto.randomUUID();
    sendAttemptRef.current = { clientMessageId, text, files };

    try {
      setActionMessage(null);
      const message = await sendMutation.mutateAsync({
        userId,
        clientMessageId,
        text,
        images: files,
      });
      keepPinnedToBottomRef.current = true;
      sendAttemptRef.current = null;
      setMessageChanges((current) => new Map(current).set(message.id, message));
      setMessageWatermark((current) => Math.max(current ?? 0, message.id));
      setDraft('');
      setImages((current) => {
        current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
        return [];
      });
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '发送失败，请重试');
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  const composer = (
    <div>
      {images.length > 0 ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <div key={image.previewUrl} className="relative size-16 shrink-0 overflow-hidden rounded-[0.625rem] border border-line">
              <img alt={`待发送图片 ${index + 1}`} className="size-full object-cover" src={image.previewUrl} />
              <button aria-label={`移除第 ${index + 1} 张图片`} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/70 text-white" type="button" onClick={() => removeImage(index)}>
                <X aria-hidden="true" className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {actionMessage ? <p className="mb-2 text-xs text-error">{actionMessage}</p> : null}
      <input ref={fileInputRef} accept={MESSAGE_IMAGE_ACCEPT} className="sr-only" multiple type="file" onChange={selectImages} />
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          aria-label="消息内容"
          className="min-h-[42px] max-h-[110px] flex-1 resize-none overflow-y-auto rounded-[22px] border-0 bg-[#f4f4f5] px-[14px] py-[10px] text-sm leading-[1.55] text-ink placeholder:text-[#8b8b8f] focus:ring-0 focus-visible:outline-none"
          placeholder="发消息……"
          rows={1}
          value={draft}
          onChange={(event) => {
            if (Array.from(event.target.value).length <= MAX_TEXT_LENGTH) setDraft(event.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          aria-label="发送"
          className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#2aabee] text-white transition-opacity active:opacity-65 disabled:opacity-45"
          disabled={sendMutation.isPending}
          type="button"
          onClick={() => void submit()}
        >
          <Send aria-hidden="true" className="size-[21px]" />
        </button>
      </div>
    </div>
  );

  const targetInitial = Array.from(target?.displayName ?? '同')[0] ?? '同';
  const chatHeader = (
    <>
      <button aria-label="返回" className="grid size-10 shrink-0 place-items-center rounded-full active:opacity-65" type="button" onClick={onClose}>
        <ChevronLeft aria-hidden="true" className="size-[29px]" strokeWidth={2.75} />
      </button>
      <button
        className="flex min-w-0 items-center disabled:pointer-events-none"
        disabled={!target}
        type="button"
        onClick={() => target && onOpenProfile(target.id)}
      >
        <CommunityAvatar
          className="size-[42px] bg-[linear-gradient(145deg,#f4f4f5,#e4e4e7)] ring-0 [&>span]:text-[15px] [&>span]:font-extrabold [&>span]:text-[#61616a]"
          fallbackLabel={targetInitial}
          src={target?.avatarUrl}
        />
        <strong className="ml-1 truncate text-[15px] font-extrabold text-[#111]">{target?.displayName ?? '私信'}</strong>
      </button>
      <ActionMenu
        className="ml-auto size-10 rounded-full text-[#111] hover:bg-transparent active:opacity-65 [&_svg]:size-[22px]"
        items={[
          { label: '查看个人主页', disabled: !target, onSelect: () => target && onOpenProfile(target.id) },
          { label: '选择图片', onSelect: () => fileInputRef.current?.click() },
        ]}
      />
    </>
  );

  return (
    <TaskDialog
      className="sm:h-full sm:max-h-none sm:max-w-[430px] sm:rounded-none sm:border-0 sm:shadow-none"
      containerClassName="sm:items-stretch sm:p-0"
      contentClassName="p-0 sm:p-0"
      footer={target ? composer : undefined}
      footerClassName="border-t-0 px-[10px] pb-[max(10px,env(safe-area-inset-bottom))] pt-[9px] shadow-[0_-8px_26px_rgba(0,0,0,0.05)] sm:px-[10px] sm:pb-[10px] sm:pt-[9px]"
      header={chatHeader}
      headerClassName="h-[calc(62px+env(safe-area-inset-top))] items-end justify-start border-0 bg-white px-2 pb-[9px] pt-[env(safe-area-inset-top)] sm:h-[62px] sm:items-end sm:px-2 sm:pb-[9px] sm:pt-0"
      open={userId !== null}
      title={target?.displayName ?? '私信'}
      onClose={onClose}
    >
      <div className="flex h-full min-h-0 flex-col bg-[#f7f8fa]">
        {targetQuery.isLoading ? <div className="h-1 w-full animate-pulse bg-line" aria-hidden="true" /> : null}
        {targetQuery.isError ? <EmptyState title="用户资料加载失败" /> : null}
        <div
          ref={scrollViewportRef}
          className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto bg-[#f7f8fa] px-[13px] pb-[22px] pt-[14px]"
          onScroll={(event) => {
            const viewport = event.currentTarget;
            keepPinnedToBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96;
          }}
        >
          {effectiveConversationId && messagesQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button disabled={messagesQuery.isFetchingNextPage} size="xs" variant="ghost" onClick={() => void loadEarlierMessages()}>
                {messagesQuery.isFetchingNextPage ? '加载中…' : '更早消息'}
              </Button>
            </div>
          ) : null}
          {messagesQuery.isLoading ? (
            <div className="space-y-2.5 pt-8" aria-hidden="true">
              <div className="h-10 w-2/3 animate-pulse rounded-[18px] bg-[#f1f2f4]" />
              <div className="ml-auto h-10 w-3/5 animate-pulse rounded-[18px] bg-[#2aabee]/25" />
            </div>
          ) : messagesQuery.isError ? (
            <EmptyState title="消息加载失败" />
          ) : messages.length === 0 ? (
            <EmptyState title="暂无消息" />
          ) : messages.map((message, index) => {
            const incoming = message.sender.id === target?.id;
            const previous = messages[index - 1];
            const position = bubbleGroupPosition(messages, index);
            const samePrevious = isSameGroup(previous, message);
            const showDay = !previous || calendarDay(previous.createdAt) !== calendarDay(message.createdAt);
            const hasTail = position === 'single' || position === 'last';
            return (
              <Fragment key={message.id}>
                {showDay ? (
                  <div className={`${index === 0 ? 'mt-1' : 'mt-6'} mx-auto mb-4 w-fit rounded-full bg-white/80 px-[10px] py-[5px] text-[10px] font-bold text-[#71717a]`}>
                    {formatMessageDay(message.createdAt)}
                  </div>
                ) : null}
                <div className={`flex w-full ${incoming ? 'justify-start' : 'justify-end'} ${samePrevious ? 'mt-0.5' : 'mt-2.5'}`}>
                  <div className={`relative min-w-14 max-w-[79%] px-[11px] py-2 text-sm leading-[1.5] shadow-[0_1px_1px_rgba(0,0,0,0.04)] ${bubbleShapeClass(incoming, position)} ${incoming ? 'bg-[#f1f2f4] text-[#111]' : 'bg-[#2aabee] text-white'} ${bubbleTailClass(incoming, hasTail)}`}>
                    {message.images.length > 0 ? (
                      <div className={`mb-2 grid gap-1.5 ${message.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {message.images.map((image) => (
                          <PrivateMediaImage key={image.id} alt="私信图片" className="max-h-64 w-full rounded-[10px] object-cover" src={image.url} />
                        ))}
                      </div>
                    ) : null}
                    <div className="flex items-end gap-2">
                      {message.text ? <span className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</span> : <span className="flex-1" />}
                      <time className="inline-flex shrink-0 items-center pb-px text-[10px] leading-none opacity-70">{formatMessageTime(message.createdAt)}</time>
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>
    </TaskDialog>
  );
}
