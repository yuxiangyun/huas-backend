/**
 * [INPUT]: 无运行时基础设施依赖，只接收互动事实的稳定 ID、参与用户与发生时间
 * [OUTPUT]: 对外提供六类 ActivityEvent、逐 recipient 稳定 eventId，以及评论/回复的统一接收者与类型规则
 * [POS]: modules/notifications/domain 的事件契约源，供 Discover/Treehole 在自身事务中生成无正文 Outbox 事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const ACTIVITY_NOTIFICATION_TYPES = [
  'discover_like',
  'discover_comment',
  'discover_comment_reply',
  'treehole_like',
  'treehole_comment',
  'treehole_comment_reply',
] as const;

export type ActivityNotificationType = typeof ACTIVITY_NOTIFICATION_TYPES[number];
export type ActivityResourceType = 'discover_post' | 'treehole_post';

export interface ActivityEvent {
  eventId: string;
  recipientUserId: number;
  actorUserId: number;
  type: ActivityNotificationType;
  resourceType: ActivityResourceType;
  resourceId: number;
  subresourceId: number | null;
  createdAt: Date;
}

export interface CreateActivityEventsInput {
  recipientUserIds: readonly number[];
  actorUserId: number;
  type: ActivityNotificationType;
  resourceType: ActivityResourceType;
  resourceId: number;
  subresourceId?: number | null;
  createdAt?: Date;
}

export interface CreateCommentActivityEventsInput {
  actorUserId: number;
  postAuthorUserId: number;
  parentCommentAuthorUserId: number | null;
  resourceType: ActivityResourceType;
  resourceId: number;
  commentId: number;
  createdAt?: Date;
}

const typeResources: Record<ActivityNotificationType, ActivityResourceType> = {
  discover_like: 'discover_post',
  discover_comment: 'discover_post',
  discover_comment_reply: 'discover_post',
  treehole_like: 'treehole_post',
  treehole_comment: 'treehole_post',
  treehole_comment_reply: 'treehole_post',
};

function requirePositiveId(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function validateActivityShape(input: Omit<ActivityEvent, 'eventId' | 'recipientUserId'>): void {
  requirePositiveId(input.actorUserId, 'actorUserId');
  requirePositiveId(input.resourceId, 'resourceId');
  if (typeResources[input.type] !== input.resourceType) {
    throw new Error(`Activity type ${input.type} cannot target ${input.resourceType}.`);
  }

  const isLike = input.type.endsWith('_like');
  if (isLike && input.subresourceId !== null) {
    throw new Error('Like activity must not have a subresourceId.');
  }
  if (!isLike) requirePositiveId(input.subresourceId ?? 0, 'subresourceId');
  if (Number.isNaN(input.createdAt.getTime())) throw new Error('createdAt must be valid.');
}

export function buildActivityEventId(
  event: Pick<
    ActivityEvent,
    'recipientUserId' | 'actorUserId' | 'type' | 'resourceType' | 'resourceId' | 'subresourceId'
  >,
): string {
  requirePositiveId(event.recipientUserId, 'recipientUserId');
  validateActivityShape({ ...event, createdAt: new Date(0) });
  return [
    'activity',
    'v1',
    event.type,
    event.resourceType,
    event.resourceId,
    event.subresourceId ?? 0,
    event.actorUserId,
    event.recipientUserId,
  ].join(':');
}

export function createActivityEvents(input: CreateActivityEventsInput): ActivityEvent[] {
  const base = {
    actorUserId: input.actorUserId,
    type: input.type,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    subresourceId: input.subresourceId ?? null,
    createdAt: input.createdAt ?? new Date(),
  };
  validateActivityShape(base);

  const recipientUserIds = Array.from(new Set(input.recipientUserIds))
    .filter((recipientUserId) => recipientUserId !== input.actorUserId);

  return recipientUserIds.map((recipientUserId) => {
    requirePositiveId(recipientUserId, 'recipientUserId');
    const event = { ...base, recipientUserId };
    return { ...event, eventId: buildActivityEventId(event) };
  });
}

export function createCommentActivityEvents(
  input: CreateCommentActivityEventsInput,
): ActivityEvent[] {
  const scope = input.resourceType === 'discover_post' ? 'discover' : 'treehole';
  if (input.parentCommentAuthorUserId === null) {
    return createActivityEvents({
      actorUserId: input.actorUserId,
      recipientUserIds: [input.postAuthorUserId],
      type: `${scope}_comment`,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      subresourceId: input.commentId,
      createdAt: input.createdAt,
    });
  }

  const events = [
    ...createActivityEvents({
      actorUserId: input.actorUserId,
      recipientUserIds: [input.parentCommentAuthorUserId],
      type: `${scope}_comment_reply`,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      subresourceId: input.commentId,
      createdAt: input.createdAt,
    }),
  ];
  if (input.postAuthorUserId !== input.parentCommentAuthorUserId) {
    events.push(...createActivityEvents({
      actorUserId: input.actorUserId,
      recipientUserIds: [input.postAuthorUserId],
      type: `${scope}_comment`,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      subresourceId: input.commentId,
      createdAt: input.createdAt,
    }));
  }
  return events;
}
