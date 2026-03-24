'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getPublicEnv } from '@/lib/env';
import { gql } from '@/lib/graphql';

type Workspace = { id: string; name: string; slug: string; plan: string };
type Channel = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: string;
  archived: boolean;
  createdAt: string;
};
type User = { id: string; handle: string; displayName?: string | null; avatarUrl?: string | null; avatarColor?: string | null };
type Message = { id: string; channelId: string; userId?: string | null; content?: string | null; type: string; createdAt: string; user?: User | null };
type Project = { id: string; workspaceId: string; name: string; description?: string | null; color: string; status: string; deadline?: string | null };
type Task = {
  id: string;
  projectId: string;
  workspaceId?: string | null;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  assignedTo?: string | null;
  assignedBy?: string | null;
  deadline?: string | null;
};
type DmRoom = { id: string; otherUser: User; lastMessage?: { id: string; content: string; createdAt: string; fromUserId?: string | null } | null };
type DmMessage = { id: string; roomId: string; fromUserId?: string | null; content: string; createdAt: string; fromUser?: User | null };

const Q_ME = `query Me { me { id handle displayName avatarUrl avatarColor githubUsername role status setupComplete } }`;
const Q_WORKSPACES = `query Ws { workspaces { id name slug plan } }`;
const Q_CHANNELS = `query Channels($workspaceId: ID!) { channels(workspaceId: $workspaceId) { id workspaceId name description type archived createdAt } }`;
const Q_MESSAGES = `query Messages($channelId: ID!, $limit: Int) { messages(channelId: $channelId, limit: $limit) { id channelId userId content type createdAt user { id handle displayName avatarUrl avatarColor } } }`;
const Q_PROJECTS = `query Projects($workspaceId: ID!) { projects(workspaceId: $workspaceId) { id workspaceId name description color status deadline } }`;
const Q_TASKS = `query Tasks($projectId: ID!) { tasks(projectId: $projectId) { id projectId workspaceId title description priority status assignedTo assignedBy deadline } }`;
const Q_SEARCH = `query Search($workspaceId: ID!, $q: String!, $limit: Int) { search(workspaceId: $workspaceId, q: $q, limit: $limit) { type id title snippet channelId projectId } }`;
const Q_DM_ROOMS = `query DmRooms { dmRooms { id otherUser { id handle displayName avatarUrl avatarColor } lastMessage { id content createdAt fromUserId } } }`;
const Q_DM_MESSAGES = `query DmMessages($roomId: ID!, $limit: Int) { dmMessages(roomId: $roomId, limit: $limit) { id roomId fromUserId content createdAt fromUser { id handle displayName avatarUrl avatarColor } } }`;
const M_DM_SEND = `mutation DmSend($toHandle: String!, $content: String!) { dmSend(toHandle: $toHandle, content: $content) { id roomId fromUserId content createdAt fromUser { id handle displayName avatarUrl avatarColor } } }`;
const M_CREATE_PROJECT = `mutation CreateProject($input: CreateProjectInput!) { createProject(input: $input) { id workspaceId name description color status deadline } }`;
const M_CREATE_TASK = `mutation CreateTask($input: CreateTaskInput!) { createTask(input: $input) { id projectId workspaceId title description priority status assignedTo assignedBy deadline } }`;
const M_UPDATE_TASK_STATUS = `mutation Upd($input: UpdateTaskStatusInput!) { updateTaskStatus(input: $input) { id projectId workspaceId title description priority status assignedTo assignedBy deadline } }`;
const M_SEND = `mutation Send($input: SendMessageInput!) { sendMessage(input: $input) { id channelId userId content type createdAt user { id handle displayName avatarUrl avatarColor } } }`;

export default function AppClient() {
  const apiUrl = useMemo(() => getPublicEnv({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL }).apiUrl, []);
  const tokenRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedChRef = useRef<string | null>(null);
  const selectedWsRef = useRef<string | null>(null);
  const selectedProjectRef = useRef<string | null>(null);
  const selectedDmRef = useRef<string | null>(null);

  const [bootError, setBootError] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedWs, setSelectedWs] = useState<string | null>(null);
  const [selectedCh, setSelectedCh] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<'chat' | 'tasks' | 'dms'>('chat');
  const [composer, setComposer] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<
    { type: string; id: string; title: string; snippet?: string | null; channelId?: string | null; projectId?: string | null }[]
  >([]);
  const [dmRooms, setDmRooms] = useState<DmRoom[]>([]);
  const [selectedDm, setSelectedDm] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);
  const [dmHandle, setDmHandle] = useState('');
  const [dmComposer, setDmComposer] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('dc_token');
    tokenRef.current = token;
    if (!token) {
      window.location.href = '/signin';
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const meData = await gql<{ me: any }, undefined>({ apiUrl, token, query: Q_ME });
        if (cancelled) return;
        setMe(meData.me);

        const wsData = await gql<{ workspaces: Workspace[] }, undefined>({ apiUrl, token, query: Q_WORKSPACES });
        if (cancelled) return;
        setWorkspaces(wsData.workspaces || []);

        const initialWs = localStorage.getItem('dc_ws') || wsData.workspaces?.[0]?.id || null;
        setSelectedWs(initialWs);
      } catch (e: any) {
        if (cancelled) return;
        setBootError(e?.message || 'Failed to load');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await gql<{ dmRooms: DmRoom[] }, undefined>({ apiUrl, token, query: Q_DM_ROOMS });
        if (cancelled) return;
        setDmRooms(data.dmRooms || []);
        const initial = localStorage.getItem('dc_dm') || data.dmRooms?.[0]?.id || null;
        setSelectedDm(initial);
      } catch {
        if (cancelled) return;
        setDmRooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, me?.id]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!token || !selectedWs) return;

    localStorage.setItem('dc_ws', selectedWs);

    let cancelled = false;
    (async () => {
      try {
        const chData = await gql<{ channels: Channel[] }, { workspaceId: string }>({
          apiUrl,
          token,
          query: Q_CHANNELS,
          variables: { workspaceId: selectedWs }
        });
        if (cancelled) return;
        setChannels(chData.channels || []);
        const initialCh = localStorage.getItem('dc_ch') || chData.channels?.[0]?.id || null;
        setSelectedCh(initialCh);

        const projData = await gql<{ projects: Project[] }, { workspaceId: string }>({
          apiUrl,
          token,
          query: Q_PROJECTS,
          variables: { workspaceId: selectedWs }
        });
        if (cancelled) return;
        setProjects(projData.projects || []);
        const initialProject = localStorage.getItem('dc_project') || projData.projects?.[0]?.id || null;
        setSelectedProject(initialProject);
      } catch (e: any) {
        if (cancelled) return;
        setBootError(e?.message || 'Failed to load channels');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, selectedWs]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!token || !selectedWs) return;
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      gql<{ search: any[] }, { workspaceId: string; q: string; limit: number }>({
        apiUrl,
        token,
        query: Q_SEARCH,
        variables: { workspaceId: selectedWs, q, limit: 25 }
      })
        .then((d) => setSearchResults(d.search || []))
        .catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [apiUrl, selectedWs, searchQ]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!token || !selectedProject) return;
    localStorage.setItem('dc_project', selectedProject);
    let cancelled = false;
    (async () => {
      try {
        const data = await gql<{ tasks: Task[] }, { projectId: string }>({
          apiUrl,
          token,
          query: Q_TASKS,
          variables: { projectId: selectedProject }
        });
        if (cancelled) return;
        setTasks(data.tasks || []);
      } catch (e: any) {
        if (cancelled) return;
        setBootError(e?.message || 'Failed to load tasks');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, selectedProject]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!token || !selectedDm) return;
    localStorage.setItem('dc_dm', selectedDm);
    let cancelled = false;
    (async () => {
      try {
        const data = await gql<{ dmMessages: DmMessage[] }, { roomId: string; limit: number }>({
          apiUrl,
          token,
          query: Q_DM_MESSAGES,
          variables: { roomId: selectedDm, limit: 50 }
        });
        if (cancelled) return;
        setDmMessages(data.dmMessages || []);
      } catch {
        if (cancelled) return;
        setDmMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, selectedDm]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!token || !selectedCh) return;
    localStorage.setItem('dc_ch', selectedCh);

    let cancelled = false;
    (async () => {
      try {
        const msgData = await gql<{ messages: Message[] }, { channelId: string; limit: number }>({
          apiUrl,
          token,
          query: Q_MESSAGES,
          variables: { channelId: selectedCh, limit: 50 }
        });
        if (cancelled) return;
        setMessages(msgData.messages || []);
      } catch (e: any) {
        if (cancelled) return;
        setBootError(e?.message || 'Failed to load messages');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, selectedCh]);

  useEffect(() => {
    selectedChRef.current = selectedCh;
  }, [selectedCh]);

  useEffect(() => {
    selectedWsRef.current = selectedWs;
  }, [selectedWs]);

  useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  useEffect(() => {
    selectedDmRef.current = selectedDm;
  }, [selectedDm]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!token) return;

    if (socketRef.current) return;
    const socket = io(apiUrl, { transports: ['websocket'], auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => undefined);
    socket.on('disconnect', () => undefined);
    socket.on('msg:new', (m: Message) => {
      setMessages((prev) => {
        if (!m?.id) return prev;
        const active = selectedChRef.current;
        if (!active || m.channelId !== active) return prev;
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m];
      });
    });

    socket.on('project:created', (p: Project) => {
      const activeWs = selectedWsRef.current;
      if (!activeWs || p.workspaceId !== activeWs) return;
      setProjects((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
    });

    socket.on('task:created', (t: Task) => {
      const activeProject = selectedProjectRef.current;
      if (!activeProject || t.projectId !== activeProject) return;
      setTasks((prev) => (prev.some((x) => x.id === t.id) ? prev : [t, ...prev]));
    });

    socket.on('task:updated', (t: Task) => {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    });

    socket.on('dm:new', (m: DmMessage) => {
      setDmMessages((prev) => {
        if (!m?.id) return prev;
        const active = selectedDmRef.current;
        if (!active || m.roomId !== active) return prev;
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m];
      });
      setDmRooms((prev) => {
        const idx = prev.findIndex((r) => r.id === m.roomId);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], lastMessage: { id: m.id, content: m.content, createdAt: m.createdAt, fromUserId: m.fromUserId || null } };
        return next;
      });
    });

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [apiUrl]);

  useEffect(() => {
    if (!selectedCh) return;
    socketRef.current?.emit('room:join', `ch:${selectedCh}`);
    return () => {
      socketRef.current?.emit('room:leave', `ch:${selectedCh}`);
    };
  }, [selectedCh]);

  useEffect(() => {
    if (!selectedWs) return;
    socketRef.current?.emit('room:join', `ws:${selectedWs}`);
    return () => {
      socketRef.current?.emit('room:leave', `ws:${selectedWs}`);
    };
  }, [selectedWs]);

  useEffect(() => {
    if (!selectedDm) return;
    socketRef.current?.emit('room:join', `dm:${selectedDm}`);
    return () => {
      socketRef.current?.emit('room:leave', `dm:${selectedDm}`);
    };
  }, [selectedDm]);

  async function send() {
    const token = tokenRef.current;
    if (!token || !selectedCh) return;
    const text = composer.trim();
    if (!text) return;
    setIsSending(true);
    try {
      const out = await gql<{ sendMessage: Message }, { input: { channelId: string; content: string } }>({
        apiUrl,
        token,
        query: M_SEND,
        variables: { input: { channelId: selectedCh, content: text } }
      });
      setComposer('');
      setMessages((prev) => (prev.some((x) => x.id === out.sendMessage.id) ? prev : [...prev, out.sendMessage]));
    } finally {
      setIsSending(false);
    }
  }

  async function createProject() {
    const token = tokenRef.current;
    if (!token || !selectedWs) return;
    const name = projectName.trim();
    if (!name) return;
    const out = await gql<{ createProject: Project }, { input: { workspaceId: string; name: string } }>({
      apiUrl,
      token,
      query: M_CREATE_PROJECT,
      variables: { input: { workspaceId: selectedWs, name } }
    });
    setProjectName('');
    setProjects((prev) => [out.createProject, ...prev]);
    setSelectedProject(out.createProject.id);
    setView('tasks');
  }

  async function createTask() {
    const token = tokenRef.current;
    if (!token || !selectedProject) return;
    const title = taskTitle.trim();
    if (!title) return;
    const out = await gql<{ createTask: Task }, { input: { projectId: string; title: string } }>({
      apiUrl,
      token,
      query: M_CREATE_TASK,
      variables: { input: { projectId: selectedProject, title } }
    });
    setTaskTitle('');
    setTasks((prev) => [out.createTask, ...prev]);
  }

  async function setTaskStatus(taskId: string, status: string) {
    const token = tokenRef.current;
    if (!token) return;
    const out = await gql<{ updateTaskStatus: Task }, { input: { taskId: string; status: string } }>({
      apiUrl,
      token,
      query: M_UPDATE_TASK_STATUS,
      variables: { input: { taskId, status } }
    });
    setTasks((prev) => prev.map((t) => (t.id === out.updateTaskStatus.id ? out.updateTaskStatus : t)));
  }

  async function dmSend() {
    const token = tokenRef.current;
    if (!token) return;
    const handle = dmHandle.trim().replace(/^@/, '').toLowerCase();
    const text = dmComposer.trim();
    if (!handle || !text) return;
    const out = await gql<{ dmSend: DmMessage }, { toHandle: string; content: string }>({
      apiUrl,
      token,
      query: M_DM_SEND,
      variables: { toHandle: handle, content: text }
    });
    setDmComposer('');
    if (out.dmSend.roomId && out.dmSend.roomId !== selectedDm) {
      setSelectedDm(out.dmSend.roomId);
      setView('dms');
    }
    setDmMessages((prev) => (prev.some((x) => x.id === out.dmSend.id) ? prev : [...prev, out.dmSend]));
    if (!dmRooms.some((r) => r.id === out.dmSend.roomId)) {
      const rooms = await gql<{ dmRooms: DmRoom[] }, undefined>({ apiUrl, token, query: Q_DM_ROOMS });
      setDmRooms(rooms.dmRooms || []);
    }
  }

  if (bootError) {
    return (
      <main className="min-h-screen bg-bg text-fg">
        <div className="mx-auto max-w-xl px-6 py-16">
          <h1 className="text-xl font-bold">Could not load</h1>
          <p className="mt-3 text-sm text-muted">{bootError}</p>
          <button
            className="mt-6 rounded-md border border-border bg-bg px-4 py-2 text-sm font-semibold hover:bg-card"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg text-fg">
      <div className="flex min-h-screen">
        <aside className="w-[320px] border-r border-border bg-card/40">
          <div className="p-4">
            <div className="text-sm font-bold">DevCollab Hub</div>
            <div className="mt-1 text-xs text-muted">{me?.handle || '...'}</div>
            <div className="mt-4 flex gap-2">
              <button
                className={`flex-1 rounded-md border border-border px-3 py-2 text-xs font-semibold ${view === 'chat' ? 'bg-bg' : 'bg-transparent hover:bg-bg/60'}`}
                onClick={() => setView('chat')}
              >
                Chat
              </button>
              <button
                className={`flex-1 rounded-md border border-border px-3 py-2 text-xs font-semibold ${view === 'tasks' ? 'bg-bg' : 'bg-transparent hover:bg-bg/60'}`}
                onClick={() => setView('tasks')}
              >
                Tasks
              </button>
              <button
                className={`flex-1 rounded-md border border-border px-3 py-2 text-xs font-semibold ${view === 'dms' ? 'bg-bg' : 'bg-transparent hover:bg-bg/60'}`}
                onClick={() => setView('dms')}
              >
                DMs
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <select
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs"
                defaultValue={typeof window !== 'undefined' ? localStorage.getItem('theme') || 'dark' : 'dark'}
                onChange={(e) => {
                  localStorage.setItem('theme', e.target.value);
                  window.location.reload();
                }}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
              <select
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs"
                defaultValue={typeof window !== 'undefined' ? localStorage.getItem('dc_dir') || 'ltr' : 'ltr'}
                onChange={(e) => {
                  localStorage.setItem('dc_dir', e.target.value);
                  window.location.reload();
                }}
              >
                <option value="ltr">LTR</option>
                <option value="rtl">RTL</option>
              </select>
            </div>
          </div>
          <div className="px-4 pb-4">
            <div className="text-xs font-semibold text-muted">Workspace</div>
            <select
              className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              value={selectedWs || ''}
              onChange={(e) => setSelectedWs(e.target.value)}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="px-4 pb-4">
            <div className="text-xs font-semibold text-muted">Search</div>
            <input
              className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              placeholder="Search messages, tasks, projects…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
            {searchResults.length ? (
              <div className="mt-2 max-h-[220px] overflow-auto rounded-md border border-border bg-bg">
                {searchResults.map((r) => (
                  <button
                    key={`${r.type}:${r.id}`}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-card"
                    onClick={() => {
                      if (r.type === 'channel' && r.channelId) {
                        setView('chat');
                        setSelectedCh(r.channelId);
                      } else if ((r.type === 'project' || r.type === 'task') && r.projectId) {
                        setView('tasks');
                        setSelectedProject(r.projectId);
                      } else if (r.type === 'message' && r.channelId) {
                        setView('chat');
                        setSelectedCh(r.channelId);
                      }
                      setSearchQ('');
                      setSearchResults([]);
                    }}
                  >
                    <div className="truncate font-semibold">{r.title}</div>
                    {r.snippet ? <div className="mt-1 truncate text-xs text-muted">{r.snippet}</div> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {view !== 'dms' ? (
            <div className="px-4 pb-6">
              <div className="text-xs font-semibold text-muted">Channels</div>
              <div className="mt-2 space-y-1">
                {channels.map((c) => {
                  const active = c.id === selectedCh;
                  return (
                    <button
                      key={c.id}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                        active ? 'bg-bg' : 'hover:bg-bg/60'
                      }`}
                      onClick={() => setSelectedCh(c.id)}
                    >
                      <span className="truncate">#{c.name}</span>
                      {c.type === 'private' ? <span className="text-xs text-muted">private</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-4 pb-6">
              <div className="text-xs font-semibold text-muted">Direct messages</div>
              <div className="mt-2 flex gap-2">
                <input
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                  placeholder="@handle"
                  value={dmHandle}
                  onChange={(e) => setDmHandle(e.target.value)}
                />
              </div>
              <div className="mt-3 space-y-1">
                {dmRooms.map((r) => {
                  const active = r.id === selectedDm;
                  return (
                    <button
                      key={r.id}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${active ? 'bg-bg' : 'hover:bg-bg/60'}`}
                      onClick={() => setSelectedDm(r.id)}
                    >
                      <div className="truncate font-semibold">@{r.otherUser.handle}</div>
                      {r.lastMessage?.content ? <div className="mt-1 truncate text-xs text-muted">{r.lastMessage.content}</div> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-border bg-card/20 px-6 py-4">
            {view === 'chat' ? (
              <div className="text-sm font-semibold">{selectedCh ? `#${channels.find((c) => c.id === selectedCh)?.name || ''}` : '...'}</div>
            ) : view === 'tasks' ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm font-semibold">Tasks</div>
                <select
                  className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
                  value={selectedProject || ''}
                  onChange={(e) => setSelectedProject(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="flex min-w-[260px] flex-1 gap-2">
                  <input
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                    placeholder="New project name…"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                  <button
                    className="rounded-md bg-[hsl(var(--brand))] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                    disabled={!projectName.trim()}
                    onClick={() => createProject()}
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm font-semibold">
                {selectedDm ? `@${dmRooms.find((r) => r.id === selectedDm)?.otherUser?.handle || ''}` : 'Direct messages'}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {view === 'chat' ? (
              <>
                <div className="flex-1 overflow-auto px-6 py-6">
                  <div className="space-y-4">
                    {messages.map((m) => (
                      <div key={m.id} className="flex gap-3">
                        <div
                          className="mt-1 h-8 w-8 flex-none rounded-full"
                          style={{ background: m.user?.avatarColor || '#22c55e' }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-semibold">{m.user?.displayName || m.user?.handle || 'Unknown'}</div>
                            <div className="text-xs text-muted">
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm text-fg/90">{m.content || ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border bg-card/10 px-6 py-4">
                  <div className="flex gap-3">
                    <input
                      className="flex-1 rounded-md border border-border bg-bg px-3 py-3 text-sm"
                      placeholder="Message…"
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                    />
                    <button
                      className="rounded-md bg-[hsl(var(--brand))] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                      disabled={isSending || !composer.trim()}
                      onClick={() => send()}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            ) : view === 'tasks' ? (
              <>
                <div className="flex-1 overflow-auto px-6 py-6">
                  <div className="space-y-3">
                    {tasks.map((t) => (
                      <div key={t.id} className="rounded-md border border-border bg-card/10 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{t.title}</div>
                            {t.description ? <div className="mt-1 text-sm text-muted">{t.description}</div> : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-muted">{t.status}</span>
                            <button
                              className="rounded-md border border-border bg-bg px-3 py-2 text-xs font-semibold hover:bg-card"
                              onClick={() => setTaskStatus(t.id, t.status === 'done' ? 'not_started' : 'done')}
                            >
                              {t.status === 'done' ? 'Undo' : 'Done'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-border bg-card/10 px-6 py-4">
                  <div className="flex gap-3">
                    <input
                      className="flex-1 rounded-md border border-border bg-bg px-3 py-3 text-sm"
                      placeholder="New task title…"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          createTask();
                        }
                      }}
                    />
                    <button
                      className="rounded-md bg-[hsl(var(--brand))] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                      disabled={!taskTitle.trim()}
                      onClick={() => createTask()}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 overflow-auto px-6 py-6">
                  <div className="space-y-4">
                    {dmMessages.map((m) => (
                      <div key={m.id} className="flex gap-3">
                        <div
                          className="mt-1 h-8 w-8 flex-none rounded-full"
                          style={{ background: m.fromUser?.avatarColor || '#22c55e' }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-semibold">{m.fromUser?.displayName || m.fromUser?.handle || 'Unknown'}</div>
                            <div className="text-xs text-muted">
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm text-fg/90">{m.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border bg-card/10 px-6 py-4">
                  <div className="flex gap-3">
                    <input
                      className="flex-1 rounded-md border border-border bg-bg px-3 py-3 text-sm"
                      placeholder="Message…"
                      value={dmComposer}
                      onChange={(e) => setDmComposer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          dmSend();
                        }
                      }}
                    />
                    <button
                      className="rounded-md bg-[hsl(var(--brand))] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                      disabled={!dmHandle.trim() || !dmComposer.trim()}
                      onClick={() => dmSend()}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
