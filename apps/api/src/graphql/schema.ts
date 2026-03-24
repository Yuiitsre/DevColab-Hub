import { GraphQLSchema } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { decrypt, encrypt } from '../lib/crypto.js';

const typeDefs = `
  scalar DateTime

  type User {
    id: ID!
    handle: String!
    displayName: String
    avatarUrl: String
    avatarColor: String
    githubUsername: String!
    role: String!
    status: String!
    setupComplete: Boolean!
  }

  type Workspace {
    id: ID!
    name: String!
    slug: String!
    plan: String!
  }

  type Channel {
    id: ID!
    workspaceId: ID!
    name: String!
    description: String!
    type: String!
    archived: Boolean!
    createdAt: DateTime!
  }

  type Message {
    id: ID!
    channelId: ID!
    userId: ID
    content: String
    type: String!
    createdAt: DateTime!
    user: User
  }

  type DirectMessageRoom {
    id: ID!
    otherUser: User!
    lastMessage: DirectMessage
  }

  type DirectMessage {
    id: ID!
    roomId: ID!
    fromUserId: ID
    content: String!
    createdAt: DateTime!
    fromUser: User
  }

  type Project {
    id: ID!
    workspaceId: ID!
    name: String!
    description: String
    color: String!
    status: String!
    deadline: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Task {
    id: ID!
    projectId: ID!
    workspaceId: ID
    title: String!
    description: String
    priority: String!
    status: String!
    assignedTo: ID
    assignedBy: ID
    deadline: DateTime
    linkedRepo: String
    linkedFile: String
    linkedBranch: String
    linkedLines: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SearchResult {
    type: String!
    id: ID!
    title: String!
    snippet: String
    channelId: ID
    projectId: ID
  }

  input CreateWorkspaceInput {
    name: String!
    description: String
  }

  input CreateChannelInput {
    workspaceId: ID!
    name: String!
    description: String
    type: String
  }

  input SendMessageInput {
    channelId: ID!
    content: String!
  }

  input CreateProjectInput {
    workspaceId: ID!
    name: String!
    description: String
    color: String
    deadline: DateTime
  }

  input CreateTaskInput {
    projectId: ID!
    title: String!
    description: String
    priority: String
    assignedTo: ID
    deadline: DateTime
    linkedRepo: String
    linkedFile: String
    linkedBranch: String
    linkedLines: String
  }

  input UpdateTaskStatusInput {
    taskId: ID!
    status: String!
  }

  type Query {
    me: User!
    workspaces: [Workspace!]!
    channels(workspaceId: ID!): [Channel!]!
    messages(channelId: ID!, limit: Int = 50): [Message!]!
    projects(workspaceId: ID!): [Project!]!
    tasks(projectId: ID!): [Task!]!
    tasksMine(workspaceId: ID): [Task!]!
    search(workspaceId: ID!, q: String!, limit: Int = 25): [SearchResult!]!
    dmRooms: [DirectMessageRoom!]!
    dmMessages(roomId: ID!, limit: Int = 50): [DirectMessage!]!
  }

  type Mutation {
    createWorkspace(input: CreateWorkspaceInput!): Workspace!
    createChannel(input: CreateChannelInput!): Channel!
    sendMessage(input: SendMessageInput!): Message!
    createProject(input: CreateProjectInput!): Project!
    createTask(input: CreateTaskInput!): Task!
    updateTaskStatus(input: UpdateTaskStatusInput!): Task!
    dmSend(toHandle: String!, content: String!): DirectMessage!
  }
`;

type Ctx = {
  prisma: any;
  io?: any;
  userId?: string;
};

async function requireWorkspaceRole(ctx: Ctx, workspaceId: string) {
  if (!ctx.userId) throw new Error('Unauthorized');
  const member = await ctx.prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.userId } }
  });
  if (!member) throw new Error('Forbidden');
  return member.role as string;
}

async function requireChannelAccess(ctx: Ctx, channelId: string) {
  if (!ctx.userId) throw new Error('Unauthorized');
  const channel = await ctx.prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error('Not found');
  await requireWorkspaceRole(ctx, channel.workspaceId);
  if (channel.type === 'private') {
    const cm = await ctx.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: channel.id, userId: ctx.userId } }
    });
    if (!cm) throw new Error('Forbidden');
  }
  return channel as any;
}

function canCreateChannel(role: string) {
  return ['owner', 'admin', 'manager', 'developer'].includes(role);
}

function canCreateProject(role: string) {
  return ['owner', 'admin', 'manager', 'developer'].includes(role);
}

function canCreateTask(role: string) {
  return ['owner', 'admin', 'manager', 'developer'].includes(role);
}

function decryptProject(p: any) {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.nameEnc ? decrypt(p.nameEnc) : 'Project',
    description: p.descriptionEnc ? decrypt(p.descriptionEnc) : null,
    color: p.color,
    status: p.status,
    deadline: p.deadline,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

function decryptTask(t: any) {
  return {
    id: t.id,
    projectId: t.projectId,
    workspaceId: t.workspaceId,
    title: t.titleEnc ? decrypt(t.titleEnc) : 'Task',
    description: t.descriptionEnc ? decrypt(t.descriptionEnc) : null,
    priority: t.priority,
    status: t.status,
    assignedTo: t.assignedTo,
    assignedBy: t.assignedBy,
    deadline: t.deadline,
    linkedRepo: t.linkedRepo,
    linkedFile: t.linkedFile,
    linkedBranch: t.linkedBranch,
    linkedLines: t.linkedLines,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
  };
}

const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const u = await ctx.prisma.user.findUnique({ where: { id: ctx.userId } });
      if (!u) throw new Error('Unauthorized');
      return {
        id: u.id,
        handle: u.handle,
        displayName: u.displayNameEnc ? decrypt(u.displayNameEnc) : null,
        avatarUrl: u.avatarUrl,
        avatarColor: u.avatarColor,
        githubUsername: u.githubUsername,
        role: u.role,
        status: u.status,
        setupComplete: u.setupComplete
      };
    },
    workspaces: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const rows = await ctx.prisma.workspaceMember.findMany({
        where: { userId: ctx.userId },
        include: { workspace: true }
      });
      return rows.map((r: any) => ({
        id: r.workspace.id,
        name: decrypt(r.workspace.nameEnc),
        slug: r.workspace.slug,
        plan: r.workspace.plan
      }));
    },
    channels: async (_: unknown, args: { workspaceId: string }, ctx: Ctx) => {
      await requireWorkspaceRole(ctx, args.workspaceId);
      const myPrivate = await ctx.prisma.channelMember.findMany({
        where: { userId: ctx.userId },
        select: { channelId: true }
      });
      const privateIds = new Set((myPrivate || []).map((x: any) => x.channelId));
      const rows = await ctx.prisma.channel.findMany({
        where: { workspaceId: args.workspaceId, archived: false },
        orderBy: { createdAt: 'asc' }
      });
      return rows
        .filter((c: any) => c.type !== 'private' || privateIds.has(c.id))
        .map((c: any) => ({
        id: c.id,
        workspaceId: c.workspaceId,
        name: c.name,
        description: c.description,
        type: c.type,
        archived: c.archived,
        createdAt: c.createdAt
      }));
    },
    messages: async (_: unknown, args: { channelId: string; limit: number }, ctx: Ctx) => {
      await requireChannelAccess(ctx, args.channelId);
      const rows = await ctx.prisma.message.findMany({
        where: { channelId: args.channelId, deleted: false },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: Math.min(args.limit || 50, 100)
      });
      return rows
        .reverse()
        .map((m: any) => ({
          id: m.id,
          channelId: m.channelId,
          userId: m.userId,
          content: m.contentEnc ? decrypt(m.contentEnc) : null,
          type: m.type,
          createdAt: m.createdAt,
          user: m.user
            ? {
                id: m.user.id,
                handle: m.user.handle,
                displayName: m.user.displayNameEnc ? decrypt(m.user.displayNameEnc) : null,
                avatarUrl: m.user.avatarUrl,
                avatarColor: m.user.avatarColor,
                githubUsername: m.user.githubUsername,
                role: m.user.role,
                status: m.user.status,
                setupComplete: m.user.setupComplete
              }
            : null
        }));
    },
    projects: async (_: unknown, args: { workspaceId: string }, ctx: Ctx) => {
      await requireWorkspaceRole(ctx, args.workspaceId);
      const rows = await ctx.prisma.project.findMany({
        where: { workspaceId: args.workspaceId },
        orderBy: { createdAt: 'desc' }
      });
      return rows.map(decryptProject);
    },
    tasks: async (_: unknown, args: { projectId: string }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const project = await ctx.prisma.project.findUnique({ where: { id: args.projectId } });
      if (!project) throw new Error('Not found');
      await requireWorkspaceRole(ctx, project.workspaceId);
      const rows = await ctx.prisma.task.findMany({
        where: { projectId: args.projectId },
        orderBy: { createdAt: 'desc' },
        take: 200
      });
      return rows.map(decryptTask);
    },
    tasksMine: async (_: unknown, args: { workspaceId?: string | null }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      if (args.workspaceId) await requireWorkspaceRole(ctx, args.workspaceId);
      const rows = await ctx.prisma.task.findMany({
        where: {
          assignedTo: ctx.userId,
          ...(args.workspaceId ? { workspaceId: args.workspaceId } : {})
        },
        orderBy: { deadline: 'asc' },
        take: 200
      });
      return rows.map(decryptTask);
    },
    search: async (_: unknown, args: { workspaceId: string; q: string; limit: number }, ctx: Ctx) => {
      await requireWorkspaceRole(ctx, args.workspaceId);
      const q = args.q.trim().toLowerCase();
      if (q.length < 2) return [];
      const limit = Math.min(args.limit || 25, 50);

      const [channels, projects] = await Promise.all([
        ctx.prisma.channel.findMany({ where: { workspaceId: args.workspaceId, archived: false }, orderBy: { createdAt: 'asc' } }),
        ctx.prisma.project.findMany({ where: { workspaceId: args.workspaceId }, orderBy: { createdAt: 'desc' }, take: 50 })
      ]);

      const channelHits = channels
        .filter((c: any) => (c.name || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q))
        .slice(0, limit)
        .map((c: any) => ({ type: 'channel', id: c.id, title: `#${c.name}`, snippet: c.description || null, channelId: c.id, projectId: null }));

      const projectHits = projects
        .map(decryptProject)
        .filter((p: any) => (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
        .slice(0, limit)
        .map((p: any) => ({ type: 'project', id: p.id, title: p.name, snippet: p.description || null, channelId: null, projectId: p.id }));

      const candidateChannelIds = channels.slice(0, 20).map((c: any) => c.id);
      const recent = await ctx.prisma.message.findMany({
        where: { channelId: { in: candidateChannelIds }, deleted: false },
        orderBy: { createdAt: 'desc' },
        take: 200
      });
      const messageHits = recent
        .map((m: any) => ({ ...m, content: m.contentEnc ? decrypt(m.contentEnc) : '' }))
        .filter((m: any) => (m.content || '').toLowerCase().includes(q))
        .slice(0, limit)
        .map((m: any) => ({
          type: 'message',
          id: m.id,
          title: 'Message',
          snippet: (m.content || '').slice(0, 160),
          channelId: m.channelId,
          projectId: null
        }));

      const tasks = await ctx.prisma.task.findMany({
        where: { workspaceId: args.workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: 100
      });
      const taskHits = tasks
        .map(decryptTask)
        .filter((t: any) => (t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
        .slice(0, limit)
        .map((t: any) => ({
          type: 'task',
          id: t.id,
          title: t.title,
          snippet: t.description ? String(t.description).slice(0, 160) : null,
          channelId: null,
          projectId: t.projectId
        }));

      const out = [...channelHits, ...projectHits, ...taskHits, ...messageHits];
      return out.slice(0, limit);
    },
    dmRooms: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const rooms = await ctx.prisma.directMessageRoom.findMany({
        where: { participants: { has: ctx.userId } },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      const out = [];
      for (const r of rooms || []) {
        const otherId = (r.participants || []).find((p: string) => p !== ctx.userId) || null;
        if (!otherId) continue;
        const other = await ctx.prisma.user.findUnique({ where: { id: otherId } });
        if (!other) continue;
        const last = await ctx.prisma.directMessage.findFirst({
          where: { roomId: r.id, NOT: { deletedFor: { has: ctx.userId } } },
          orderBy: { createdAt: 'desc' }
        });
        out.push({
          id: r.id,
          otherUser: {
            id: other.id,
            handle: other.handle,
            displayName: other.displayNameEnc ? decrypt(other.displayNameEnc) : null,
            avatarUrl: other.avatarUrl,
            avatarColor: other.avatarColor,
            githubUsername: other.githubUsername,
            role: other.role,
            status: other.status,
            setupComplete: other.setupComplete
          },
          lastMessage: last
            ? {
                id: last.id,
                roomId: last.roomId,
                fromUserId: last.fromUser,
                content: decrypt(last.contentEnc),
                createdAt: last.createdAt,
                fromUser: null
              }
            : null
        });
      }
      return out;
    },
    dmMessages: async (_: unknown, args: { roomId: string; limit: number }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const room = await ctx.prisma.directMessageRoom.findUnique({ where: { id: args.roomId } });
      if (!room) throw new Error('Not found');
      if (!(room.participants || []).includes(ctx.userId)) throw new Error('Forbidden');
      const rows = await ctx.prisma.directMessage.findMany({
        where: { roomId: args.roomId, NOT: { deletedFor: { has: ctx.userId } } },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: Math.min(args.limit || 50, 100)
      });
      return rows
        .reverse()
        .map((m: any) => ({
          id: m.id,
          roomId: m.roomId,
          fromUserId: m.fromUser,
          content: decrypt(m.contentEnc),
          createdAt: m.createdAt,
          fromUser: m.user
            ? {
                id: m.user.id,
                handle: m.user.handle,
                displayName: m.user.displayNameEnc ? decrypt(m.user.displayNameEnc) : null,
                avatarUrl: m.user.avatarUrl,
                avatarColor: m.user.avatarColor,
                githubUsername: m.user.githubUsername,
                role: m.user.role,
                status: m.user.status,
                setupComplete: m.user.setupComplete
              }
            : null
        }));
    }
  },
  Mutation: {
    createWorkspace: async (_: unknown, args: { input: { name: string; description?: string | null } }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const base = args.input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
      const slug = `${base}-${Math.random().toString(16).slice(2, 8)}`;
      const ws = await ctx.prisma.workspace.create({
        data: {
          nameEnc: encrypt(args.input.name.trim().slice(0, 100)),
          descriptionEnc: args.input.description ? encrypt(args.input.description.trim().slice(0, 500)) : null,
          slug,
          ownerId: ctx.userId
        }
      });
      await ctx.prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: ctx.userId, role: 'owner' }
      });
      await ctx.prisma.channel.createMany({
        data: [
          { workspaceId: ws.id, name: 'general', description: 'General', type: 'public', createdBy: ctx.userId },
          { workspaceId: ws.id, name: 'github-feed', description: 'GitHub activity', type: 'public', createdBy: ctx.userId },
          { workspaceId: ws.id, name: 'ai-help', description: 'AI help', type: 'public', createdBy: ctx.userId }
        ],
        skipDuplicates: true
      });
      return { id: ws.id, name: decrypt(ws.nameEnc), slug: ws.slug, plan: ws.plan };
    },
    createChannel: async (
      _: unknown,
      args: { input: { workspaceId: string; name: string; description?: string | null; type?: string | null } },
      ctx: Ctx
    ) => {
      const role = await requireWorkspaceRole(ctx, args.input.workspaceId);
      if (!canCreateChannel(role)) throw new Error('Forbidden');
      const name = args.input.name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
      const ch = await ctx.prisma.channel.create({
        data: {
          workspaceId: args.input.workspaceId,
          name,
          description: (args.input.description || '').trim().slice(0, 300),
          type: (args.input.type || 'public').trim().slice(0, 20),
          createdBy: ctx.userId
        }
      });
      if (ch.type === 'private') {
        await ctx.prisma.channelMember.create({ data: { channelId: ch.id, userId: ctx.userId } });
      }
      return {
        id: ch.id,
        workspaceId: ch.workspaceId,
        name: ch.name,
        description: ch.description,
        type: ch.type,
        archived: ch.archived,
        createdAt: ch.createdAt
      };
    },
    sendMessage: async (_: unknown, args: { input: { channelId: string; content: string } }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const channel = await requireChannelAccess(ctx, args.input.channelId);
      const trimmed = args.input.content.trim();
      if (!trimmed) throw new Error('Empty message');
      const saved = await ctx.prisma.message.create({
        data: {
          channelId: channel.id,
          userId: ctx.userId,
          contentEnc: encrypt(trimmed.slice(0, 5000)),
          type: 'text'
        },
        include: { user: true }
      });
      const out = {
        id: saved.id,
        channelId: saved.channelId,
        userId: saved.userId,
        content: saved.contentEnc ? decrypt(saved.contentEnc) : null,
        type: saved.type,
        createdAt: saved.createdAt,
        user: saved.user
          ? {
              id: saved.user.id,
              handle: saved.user.handle,
              displayName: saved.user.displayNameEnc ? decrypt(saved.user.displayNameEnc) : null,
              avatarUrl: saved.user.avatarUrl,
              avatarColor: saved.user.avatarColor,
              githubUsername: saved.user.githubUsername,
              role: saved.user.role,
              status: saved.user.status,
              setupComplete: saved.user.setupComplete
            }
          : null
      };
      ctx.io?.to(`ch:${channel.id}`).emit('msg:new', out);
      return out;
    },
    dmSend: async (_: unknown, args: { toHandle: string; content: string }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const to = await ctx.prisma.user.findUnique({ where: { handle: args.toHandle.toLowerCase() } });
      if (!to) throw new Error('User not found');
      if (to.id === ctx.userId) throw new Error('Invalid recipient');
      const roomId = [ctx.userId, to.id].sort().join(':');
      await ctx.prisma.directMessageRoom.upsert({
        where: { id: roomId },
        create: { id: roomId, participants: [ctx.userId, to.id] },
        update: { participants: [ctx.userId, to.id] }
      });
      const trimmed = args.content.trim();
      if (!trimmed) throw new Error('Empty message');
      const saved = await ctx.prisma.directMessage.create({
        data: { roomId, fromUser: ctx.userId, contentEnc: encrypt(trimmed.slice(0, 5000)) },
        include: { user: true }
      });
      const out = {
        id: saved.id,
        roomId: saved.roomId,
        fromUserId: saved.fromUser,
        content: decrypt(saved.contentEnc),
        createdAt: saved.createdAt,
        fromUser: saved.user
          ? {
              id: saved.user.id,
              handle: saved.user.handle,
              displayName: saved.user.displayNameEnc ? decrypt(saved.user.displayNameEnc) : null,
              avatarUrl: saved.user.avatarUrl,
              avatarColor: saved.user.avatarColor,
              githubUsername: saved.user.githubUsername,
              role: saved.user.role,
              status: saved.user.status,
              setupComplete: saved.user.setupComplete
            }
          : null
      };
      ctx.io?.to(`dm:${roomId}`).emit('dm:new', out);
      return out;
    },
    createProject: async (
      _: unknown,
      args: { input: { workspaceId: string; name: string; description?: string | null; color?: string | null; deadline?: string | null } },
      ctx: Ctx
    ) => {
      const role = await requireWorkspaceRole(ctx, args.input.workspaceId);
      if (!canCreateProject(role)) throw new Error('Forbidden');
      const name = args.input.name.trim();
      if (!name) throw new Error('Name required');
      const proj = await ctx.prisma.project.create({
        data: {
          workspaceId: args.input.workspaceId,
          nameEnc: encrypt(name.slice(0, 100)),
          descriptionEnc: args.input.description ? encrypt(args.input.description.trim().slice(0, 1000)) : null,
          color: (args.input.color || '#22c55e').slice(0, 20),
          deadline: args.input.deadline ? new Date(args.input.deadline) : null,
          status: 'active',
          createdBy: ctx.userId
        }
      });
      await ctx.prisma.projectMember.create({ data: { projectId: proj.id, userId: ctx.userId, role: 'owner' } });
      const out = decryptProject(proj);
      ctx.io?.to(`ws:${args.input.workspaceId}`).emit('project:created', out);
      return out;
    },
    createTask: async (
      _: unknown,
      args: {
        input: {
          projectId: string;
          title: string;
          description?: string | null;
          priority?: string | null;
          assignedTo?: string | null;
          deadline?: string | null;
          linkedRepo?: string | null;
          linkedFile?: string | null;
          linkedBranch?: string | null;
          linkedLines?: string | null;
        };
      },
      ctx: Ctx
    ) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const project = await ctx.prisma.project.findUnique({ where: { id: args.input.projectId } });
      if (!project) throw new Error('Not found');
      const role = await requireWorkspaceRole(ctx, project.workspaceId);
      if (!canCreateTask(role)) throw new Error('Forbidden');
      const title = args.input.title.trim();
      if (!title) throw new Error('Title required');
      const saved = await ctx.prisma.task.create({
        data: {
          projectId: project.id,
          workspaceId: project.workspaceId,
          titleEnc: encrypt(title.slice(0, 200)),
          descriptionEnc: args.input.description ? encrypt(args.input.description.trim().slice(0, 5000)) : null,
          priority: (args.input.priority || 'normal').slice(0, 20),
          status: 'not_started',
          assignedTo: args.input.assignedTo || null,
          assignedBy: ctx.userId,
          deadline: args.input.deadline ? new Date(args.input.deadline) : null,
          linkedRepo: args.input.linkedRepo || null,
          linkedFile: args.input.linkedFile || null,
          linkedBranch: args.input.linkedBranch || null,
          linkedLines: args.input.linkedLines || null
        }
      });
      const out = decryptTask(saved);
      ctx.io?.to(`ws:${project.workspaceId}`).emit('task:created', out);
      return out;
    },
    updateTaskStatus: async (_: unknown, args: { input: { taskId: string; status: string } }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const task = await ctx.prisma.task.findUnique({ where: { id: args.input.taskId } });
      if (!task) throw new Error('Not found');
      if (task.workspaceId) await requireWorkspaceRole(ctx, task.workspaceId);
      const next = args.input.status.trim().slice(0, 30);
      const updated = await ctx.prisma.task.update({
        where: { id: task.id },
        data: { status: next }
      });
      const out = decryptTask(updated);
      if (task.workspaceId) ctx.io?.to(`ws:${task.workspaceId}`).emit('task:updated', out);
      return out;
    }
  }
};

export function buildSchema(): GraphQLSchema {
  return makeExecutableSchema({ typeDefs, resolvers });
}
