import { useEffect, useState } from 'react';
import { ArrowLeft, CircleCheck, LoaderCircle, MessageSquareText, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  configureNoteInbox,
  getNoteInboxStatus,
  getNoteInboxMessages,
  syncNoteInbox,
} from '@/api';
import type { NoteInboxMessageListResponse, NoteInboxStatus, NoteStyle } from '@shared/api.interface';

export default function NoteInboxPage() {
  const [chatId, setChatId] = useState('');
  const [noteStyle] = useState<NoteStyle>('learning');
  const [status, setStatus] = useState<NoteInboxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState<NoteInboxMessageListResponse | null>(null);

  async function refresh(): Promise<void> {
    try {
      const next: NoteInboxStatus = await getNoteInboxStatus();
      setStatus(next);
      if (next.configured) setMessages(await getNoteInboxMessages());
      setChatId((current: string) => current || next.chatId || '');
    } catch {
      toast.error('无法读取飞书收集箱状态');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save(): Promise<void> {
    if (!chatId.trim()) {
      toast.error('请填写飞书会话 ID');
      return;
    }
    setSaving(true);
    try {
      const next: NoteInboxStatus = await configureNoteInbox({
        chatId: chatId.trim(),
        noteStyle,
      });
      setStatus(next);
      setMessages(await getNoteInboxMessages());
      toast.success('收集箱已绑定，之后的新消息会自动处理');
    } catch {
      toast.error('绑定失败，请检查会话 ID 与飞书授权');
    } finally {
      setSaving(false);
    }
  }

  async function sync(): Promise<void> {
    setSaving(true);
    try {
      const next: NoteInboxStatus = await syncNoteInbox();
      setStatus(next);
      setMessages(await getNoteInboxMessages());
      if (next.lastError) toast.error(next.lastError);
      else toast.success('已检查最新飞书消息');
    } catch {
      toast.error('同步失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-5 py-7 text-[#161616] md:px-10 md:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between border-b border-black/8 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#3370ff] text-white">
              <MessageSquareText className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">飞书链接收集箱</p>
              <p className="text-xs text-black/45">手机分享，电脑自动处理</p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/">
              <ArrowLeft className="size-4" />
              返回入口
            </Link>
          </Button>
        </header>

        <section className="mt-10 space-y-7">
          <div>
            <h1 className="text-3xl font-semibold">绑定一个专用飞书会话</h1>
            <p className="mt-3 text-sm leading-6 text-black/52">
              在手机将 B站或抖音链接发送到该会话。本机每 30 秒检查一次新消息，并自动创建学习笔记任务。
            </p>
          </div>

          <div className="border-y border-black/8 py-6">
            <label className="block text-sm font-medium">
              飞书会话 ID
              <Input
                className="mt-2 h-12 bg-white"
                onChange={(event) => setChatId(event.target.value)}
                placeholder="oc_xxxxxxxxxxxxx"
                value={chatId}
              />
            </label>
            <p className="mt-3 text-xs leading-5 text-black/45">
              建议创建仅自己使用的群聊“媒体收集箱”。使用命令
              <code className="mx-1 rounded bg-black/5 px-1 py-0.5">lark-cli im +chat-search --as user --query 媒体收集箱 --format json</code>
              可查到其 <code className="rounded bg-black/5 px-1 py-0.5">oc_</code> 会话 ID。
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-black/52">
              <LoaderCircle className="size-4 animate-spin" />
              正在读取配置
            </div>
          ) : status?.configured ? (
            <div className="flex items-start gap-3 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold">已绑定收集箱</p>
                <p className="mt-1 leading-5">已收到 {status.summary?.totalMessages ?? 0} 条链接消息。{status.lastError || '新链接会自动进入视频学习笔记流程。'}</p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="h-11 flex-1" disabled={saving} onClick={() => void save()}>
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <MessageSquareText className="size-4" />}
              绑定收集箱
            </Button>
            <Button className="h-11" disabled={saving || !status?.configured} onClick={() => void sync()} variant="outline">
              <RefreshCw className="size-4" />
              立即检查
            </Button>
          </div>
          {messages && (
            <section className="border-t border-black/8 pt-6" data-ai-section-type="card-list">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold">飞书消息</h2><p className="mt-1 text-xs text-black/50">按发送时间排序：成功 {messages.summary.succeeded}，处理中 {messages.summary.processing + messages.summary.queued}，重复 {messages.summary.duplicates}，失败 {messages.summary.failed}</p></div>
                <Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4" />刷新</Button>
              </div>
              <div className="mt-4 divide-y border-y border-black/8 bg-white">
                {messages.items.length === 0 ? <p className="p-5 text-sm text-black/50">尚未收到支持的链接消息。</p> : messages.items.map((message) => (
                  <div className="p-4" key={message.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{message.mediaTitle || message.subject}</p><span className="text-xs text-black/55">{message.status === 'DUPLICATE' ? '重复，已关联原任务' : message.status}</span></div>
                    <p className="mt-1 break-all text-xs text-black/50">{message.originalUrl || message.statusReason}</p>
                    <p className="mt-2 text-xs text-black/40">{message.platform === 'douyin' ? '抖音' : message.platform === 'bilibili' ? 'B站' : '其他'} · {message.messageCreatedAt ? new Date(message.messageCreatedAt).toLocaleString() : '同步时记录'}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
