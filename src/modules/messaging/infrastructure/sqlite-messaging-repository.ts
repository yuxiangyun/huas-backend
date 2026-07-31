/**
 * [INPUT]: 依赖构造注入的 Drizzle db、Messaging 自有 schema 与领域事实/仓储契约
 * [OUTPUT]: 对外提供 SQLiteMessagingRepository 与 MessagingDatabase/MessagingTransaction 类型
 * [POS]: modules/messaging/infrastructure 的事实 adapter，以同步 SQLite 短事务复验幂等/事实限流，并保证首消息建会话、全图片元数据与 last_message 同提交
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  and,
  asc,
  desc,
  eq,
  gte,
  gt,
  inArray,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { schema, type getDb } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';
import type {
  CommitMessageInput,
  CommitMessageResult,
  ConversationFact,
  ConversationListFact,
  IdempotentMessageFact,
  MessageFact,
  MessageImageFact,
  MessagingPolicy,
} from '../domain/messaging';
import type { MessagingRepository } from '../domain/ports';

export type MessagingDatabase = ReturnType<typeof getDb>;
export type MessagingTransaction = Parameters<Parameters<MessagingDatabase['transaction']>[0]>[0];
type MessagingExecutor = MessagingDatabase | MessagingTransaction;

const conversationColumns = {
  id: schema.conversations.id,
  userLowId: schema.conversations.userLowId,
  userHighId: schema.conversations.userHighId,
  lowLastReadMessageId: schema.conversations.lowLastReadMessageId,
  highLastReadMessageId: schema.conversations.highLastReadMessageId,
  lastMessageId: schema.conversations.lastMessageId,
  createdAt: schema.conversations.createdAt,
  updatedAt: schema.conversations.updatedAt,
};

const messageColumns = {
  id: schema.messages.id,
  conversationId: schema.messages.conversationId,
  senderUserId: schema.messages.senderUserId,
  clientMessageId: schema.messages.clientMessageId,
  text: schema.messages.text,
  createdAt: schema.messages.createdAt,
};

function toConversationFact(row: ConversationFact): ConversationFact {
  return { ...row };
}

function toMessageFact(row: Omit<MessageFact, 'images'>, images: MessageImageFact[] = []): MessageFact {
  return { ...row, images };
}

function conversationFilter(userId: number) {
  return or(
    eq(schema.conversations.userLowId, userId),
    eq(schema.conversations.userHighId, userId),
  );
}

export class SQLiteMessagingRepository implements MessagingRepository {
  constructor(
    private readonly db: MessagingDatabase,
    private readonly policy: Pick<MessagingPolicy, 'sendLimit' | 'sendWindowMs'>,
  ) {}

  async findByClientMessageId(
    senderUserId: number,
    clientMessageId: string,
  ): Promise<IdempotentMessageFact | null> {
    const rows = await this.db.select({
      ...messageColumns,
      conversation: conversationColumns,
    }).from(schema.messages)
      .innerJoin(
        schema.conversations,
        eq(schema.messages.conversationId, schema.conversations.id),
      )
      .where(and(
        eq(schema.messages.senderUserId, senderUserId),
        eq(schema.messages.clientMessageId, clientMessageId),
      ))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const messages = await this.hydrateMessages(this.db, [{
      id: row.id,
      conversationId: row.conversationId,
      senderUserId: row.senderUserId,
      clientMessageId: row.clientMessageId,
      text: row.text,
      createdAt: row.createdAt,
    }]);
    return {
      conversation: toConversationFact(row.conversation),
      message: messages[0]!,
    };
  }

  async commitMessage(input: CommitMessageInput): Promise<CommitMessageResult> {
    return this.db.transaction((transaction) => {
      const existingRows = transaction.select({
        ...messageColumns,
        conversation: conversationColumns,
      }).from(schema.messages)
        .innerJoin(
          schema.conversations,
          eq(schema.messages.conversationId, schema.conversations.id),
        )
        .where(and(
          eq(schema.messages.senderUserId, input.senderUserId),
          eq(schema.messages.clientMessageId, input.clientMessageId),
        ))
        .limit(1)
        .all();
      const existing = existingRows[0];
      if (existing) {
        return {
          created: false,
          conversation: toConversationFact(existing.conversation),
          message: this.hydrateMessagesSync(transaction, [{
            id: existing.id,
            conversationId: existing.conversationId,
            senderUserId: existing.senderUserId,
            clientMessageId: existing.clientMessageId,
            text: existing.text,
            createdAt: existing.createdAt,
          }])[0]!,
        };
      }

      const windowStart = new Date(input.createdAt.getTime() - this.policy.sendWindowMs);
      const recentRows = transaction.select({ count: sql<number>`count(*)` })
        .from(schema.messages)
        .where(and(
          eq(schema.messages.senderUserId, input.senderUserId),
          gte(schema.messages.createdAt, windowStart),
        ))
        .all();
      if (Number(recentRows[0]?.count ?? 0) >= this.policy.sendLimit) {
        throw new AppError(ErrorCode.TOO_MANY_REQUESTS, '私信发送过于频繁，请稍后再试');
      }

      const userLowId = Math.min(input.senderUserId, input.recipientUserId);
      const userHighId = Math.max(input.senderUserId, input.recipientUserId);
      transaction.insert(schema.conversations).values({
        userLowId,
        userHighId,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      }).onConflictDoNothing().run();

      const conversations = transaction.select(conversationColumns)
        .from(schema.conversations)
        .where(and(
          eq(schema.conversations.userLowId, userLowId),
          eq(schema.conversations.userHighId, userHighId),
        ))
        .limit(1)
        .all();
      const conversation = conversations[0];
      if (!conversation) throw new Error('Messaging conversation upsert failed.');

      const insertedMessages = transaction.insert(schema.messages).values({
        conversationId: conversation.id,
        senderUserId: input.senderUserId,
        clientMessageId: input.clientMessageId,
        text: input.text,
        createdAt: input.createdAt,
      }).returning(messageColumns).all();
      const insertedMessage = insertedMessages[0];
      if (!insertedMessage) throw new Error('Messaging message insert failed.');

      if (input.media && input.media.images.length > 0) {
        transaction.insert(schema.messageImages).values(input.media.images.map((image) => ({
          messageId: insertedMessage.id,
          storageKey: image.storageKey,
          sortOrder: image.sortOrder,
          width: image.width,
          height: image.height,
          sizeBytes: image.sizeBytes,
          mimeType: image.mimeType,
          createdAt: input.createdAt,
        }))).run();
      }

      transaction.update(schema.conversations).set({
        lastMessageId: insertedMessage.id,
        updatedAt: input.createdAt,
      }).where(eq(schema.conversations.id, conversation.id)).run();

      return {
        created: true,
        conversation: {
          ...conversation,
          lastMessageId: insertedMessage.id,
          updatedAt: input.createdAt,
        },
        message: this.hydrateMessagesSync(transaction, [insertedMessage])[0]!,
      };
    });
  }

  async getConversationForUser(userId: number, conversationId: number) {
    const rows = await this.db.select(conversationColumns)
      .from(schema.conversations)
      .where(and(
        eq(schema.conversations.id, conversationId),
        conversationFilter(userId),
      ))
      .limit(1);
    return rows[0] ? toConversationFact(rows[0]) : null;
  }

  listConversations(userId: number, page: number, pageSize: number) {
    return this.listConversationFacts(page, pageSize, userId);
  }

  async listMessagesForUser(
    userId: number,
    conversationId: number,
    afterMessageId: number,
    limit: number,
  ) {
    if (!(await this.getConversationForUser(userId, conversationId))) return null;
    return this.listMessages(conversationId, afterMessageId, limit);
  }

  async markRead(userId: number, conversationId: number, throughMessageId: number | null) {
    return this.db.transaction((transaction) => {
      const conversations = transaction.select(conversationColumns)
        .from(schema.conversations)
        .where(and(
          eq(schema.conversations.id, conversationId),
          conversationFilter(userId),
        ))
        .limit(1)
        .all();
      const conversation = conversations[0];
      if (!conversation) return null;

      const targetMessageId = throughMessageId ?? conversation.lastMessageId;
      if (targetMessageId !== null) {
        const target = transaction.select({ id: schema.messages.id })
          .from(schema.messages)
          .where(and(
            eq(schema.messages.id, targetMessageId),
            eq(schema.messages.conversationId, conversationId),
          ))
          .limit(1)
          .all()[0];
        if (!target) return null;

        const cursorColumn = conversation.userLowId === userId
          ? schema.conversations.lowLastReadMessageId
          : schema.conversations.highLastReadMessageId;
        transaction.update(schema.conversations).set({
          [conversation.userLowId === userId ? 'lowLastReadMessageId' : 'highLastReadMessageId']:
            sql`max(coalesce(${cursorColumn}, 0), ${targetMessageId})`,
        }).where(eq(schema.conversations.id, conversationId)).run();
      }

      const updated = transaction.select(conversationColumns)
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId))
        .limit(1)
        .all()[0]!;
      const lastReadMessageId = updated.userLowId === userId
        ? updated.lowLastReadMessageId
        : updated.highLastReadMessageId;
      const unreadRows = transaction.select({ count: sql<number>`count(*)` })
        .from(schema.messages)
        .where(and(
          eq(schema.messages.conversationId, conversationId),
          ne(schema.messages.senderUserId, userId),
          gt(schema.messages.id, lastReadMessageId ?? 0),
        ))
        .all();
      return {
        lastReadMessageId,
        unreadCount: Number(unreadRows[0]?.count ?? 0),
      };
    });
  }

  async countUnread(userId: number) {
    const rows = await this.db.select({ count: sql<number>`count(*)` })
      .from(schema.messages)
      .innerJoin(
        schema.conversations,
        eq(schema.messages.conversationId, schema.conversations.id),
      )
      .where(and(
        conversationFilter(userId),
        ne(schema.messages.senderUserId, userId),
        sql`${schema.messages.id} > coalesce(
          case when ${schema.conversations.userLowId} = ${userId}
            then ${schema.conversations.lowLastReadMessageId}
            else ${schema.conversations.highLastReadMessageId}
          end,
          0
        )`,
      ));
    return Number(rows[0]?.count ?? 0);
  }

  listAllConversations(page: number, pageSize: number) {
    return this.listConversationFacts(page, pageSize, null);
  }

  async listAllMessages(conversationId: number, afterMessageId: number, limit: number) {
    const exists = await this.db.select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1);
    return exists.length === 0 ? null : this.listMessages(conversationId, afterMessageId, limit);
  }

  private async listConversationFacts(
    page: number,
    pageSize: number,
    userId: number | null,
  ): Promise<{ items: ConversationListFact[]; total: number }> {
    const filter = userId === null ? undefined : conversationFilter(userId);
    const unreadExpression = userId === null
      ? sql<number>`0`
      : sql<number>`(
          select count(*) from messages unread_messages
          where unread_messages.conversation_id = ${schema.conversations.id}
            and unread_messages.sender_user_id <> ${userId}
            and unread_messages.id > coalesce(
              case when ${schema.conversations.userLowId} = ${userId}
                then ${schema.conversations.lowLastReadMessageId}
                else ${schema.conversations.highLastReadMessageId}
              end,
              0
            )
        )`;
    const countQuery = this.db.select({ count: sql<number>`count(*)` })
      .from(schema.conversations);
    const countRows = filter ? await countQuery.where(filter) : await countQuery;
    let rowsQuery = this.db.select({
      conversation: conversationColumns,
      lastMessage: {
        id: schema.messages.id,
        conversationId: schema.messages.conversationId,
        senderUserId: schema.messages.senderUserId,
        clientMessageId: schema.messages.clientMessageId,
        text: schema.messages.text,
        createdAt: schema.messages.createdAt,
      },
      unreadCount: unreadExpression,
    }).from(schema.conversations)
      .leftJoin(schema.messages, eq(schema.conversations.lastMessageId, schema.messages.id))
      .$dynamic();
    if (filter) rowsQuery = rowsQuery.where(filter);
    const rows = await rowsQuery
      .orderBy(desc(schema.conversations.updatedAt), desc(schema.conversations.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const lastMessageRows = rows.flatMap((row) => row.lastMessage?.id ? [row.lastMessage] : []);
    const hydrated = await this.hydrateMessages(this.db, lastMessageRows);
    const messagesById = new Map(hydrated.map((message) => [message.id, message]));
    return {
      items: rows.map((row) => ({
        conversation: toConversationFact(row.conversation),
        lastMessage: row.lastMessage?.id ? messagesById.get(row.lastMessage.id) ?? null : null,
        unreadCount: Number(row.unreadCount ?? 0),
      })),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  private async listMessages(conversationId: number, afterMessageId: number, limit: number) {
    const rows = await this.db.select(messageColumns)
      .from(schema.messages)
      .where(and(
        eq(schema.messages.conversationId, conversationId),
        gt(schema.messages.id, afterMessageId),
      ))
      .orderBy(asc(schema.messages.id))
      .limit(limit);
    return this.hydrateMessages(this.db, rows);
  }

  private async hydrateMessages(
    executor: MessagingExecutor,
    rows: Array<Omit<MessageFact, 'images'>>,
  ) {
    if (rows.length === 0) return [];
    const images = await executor.select()
      .from(schema.messageImages)
      .where(inArray(schema.messageImages.messageId, rows.map((row) => row.id)))
      .orderBy(asc(schema.messageImages.messageId), asc(schema.messageImages.sortOrder));
    return mapImagesToMessages(rows, images);
  }

  private hydrateMessagesSync(
    executor: MessagingTransaction,
    rows: Array<Omit<MessageFact, 'images'>>,
  ) {
    if (rows.length === 0) return [];
    const images = executor.select()
      .from(schema.messageImages)
      .where(inArray(schema.messageImages.messageId, rows.map((row) => row.id)))
      .orderBy(asc(schema.messageImages.messageId), asc(schema.messageImages.sortOrder))
      .all();
    return mapImagesToMessages(rows, images);
  }
}

function mapImagesToMessages(
  messages: Array<Omit<MessageFact, 'images'>>,
  images: Array<typeof schema.messageImages.$inferSelect>,
) {
  const imagesByMessageId = new Map<number, MessageImageFact[]>();
  for (const image of images) {
    const mapped: MessageImageFact = {
      ...image,
      mimeType: image.mimeType as 'image/webp',
    };
    const current = imagesByMessageId.get(image.messageId) ?? [];
    current.push(mapped);
    imagesByMessageId.set(image.messageId, current);
  }
  return messages.map((message) => toMessageFact(message, imagesByMessageId.get(message.id) ?? []));
}
