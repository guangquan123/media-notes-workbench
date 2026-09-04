import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileAudio,
  FolderCog,
  FolderOpen,
  HardDrive,
  ListFilter,
  LoaderCircle,
  Mic2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type RecordingStatus = 'pending' | 'processed' | 'failed';
type StorageStatus = 'archived' | 'pending';

interface RecordingItem {
  capturedAt: string;
  duration: string;
  fileName: string;
  fileSize: string;
  id: string;
  processing: RecordingStatus;
  storage: StorageStatus;
  title: string;
}

const RECORDINGS: readonly RecordingItem[] = [
  {
    id: 'customer-interview',
    title: '客户访谈：需求梳理与下阶段计划',
    capturedAt: '今天 14:18',
    duration: '42 分 18 秒',
    fileName: '2026-09-04_客户访谈_需求梳理.m4a',
    fileSize: '68.4 MB',
    processing: 'pending',
    storage: 'archived',
  },
  {
    id: 'weekly-review',
    title: '产品周会：迭代评审与风险同步',
    capturedAt: '昨天 10:06',
    duration: '58 分 04 秒',
    fileName: '2026-09-03_产品周会_迭代评审.m4a',
    fileSize: '92.1 MB',
    processing: 'processed',
    storage: 'archived',
  },
  {
    id: 'course-third',
    title: '数据治理课程 · 第三讲：质量规则设计',
    capturedAt: '9 月 1 日 19:40',
    duration: '1 小时 12 分',
    fileName: '2026-09-01_数据治理课程_第三讲.webm',
    fileSize: '144.8 MB',
    processing: 'pending',
    storage: 'pending',
  },
  {
    id: 'user-research',
    title: '用户调研访谈记录（3 位受访者）',
    capturedAt: '8 月 29 日 15:12',
    duration: '36 分 51 秒',
    fileName: '2026-08-29_用户调研访谈.m4a',
    fileSize: '51.7 MB',
    processing: 'failed',
    storage: 'archived',
  },
];

function statusLabel(status: RecordingStatus): string {
  if (status === 'processed') return '已生成笔记';
  if (status === 'failed') return '处理失败';
  return '未处理';
}

function statusClass(status: RecordingStatus): string {
  if (status === 'processed') return 'bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
}

function storageLabel(status: StorageStatus): string {
  return status === 'archived' ? '已归档' : '待归档';
}

export default function RecordingLibraryPage() {
  const [selectedId, setSelectedId] = useState('customer-interview');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RecordingStatus>('all');
  const [storageFilter, setStorageFilter] = useState<'all' | StorageStatus>('all');
  const [storageOpen, setStorageOpen] = useState(false);
  const [autoArchive, setAutoArchive] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [archivePath, setArchivePath] = useState('D:\\录音归档\\2026');

  const visibleRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return RECORDINGS.filter((record) => {
      const matchesKeyword = !normalizedKeyword || `${record.title} ${record.fileName}`.toLowerCase().includes(normalizedKeyword);
      const matchesStatus = statusFilter === 'all' || record.processing === statusFilter;
      const matchesStorage = storageFilter === 'all' || record.storage === storageFilter;
      return matchesKeyword && matchesStatus && matchesStorage;
    });
  }, [keyword, statusFilter, storageFilter]);

  const selected = RECORDINGS.find((record) => record.id === selectedId) || RECORDINGS[0];

  const startProcessing = (): void => {
    setProcessing(true);
    window.setTimeout(() => {
      setProcessing(false);
      toast.success('已创建转写任务，录音源文件保持不变');
    }, 650);
  };

  return (
    <main className="min-h-screen overflow-auto bg-[#f6f7f5] text-[#161616]">
      <div className="min-h-screen bg-[linear-gradient(135deg,rgba(17,19,21,0.018)_1px,transparent_1px)] bg-[size:32px_32px]">
        <div className="mx-auto min-h-screen max-w-7xl px-5 md:px-8">
          <header className="sticky top-0 z-20 -mx-5 flex h-12 items-center justify-between gap-4 border-b border-black/8 bg-[#f6f7f5]/95 px-5 backdrop-blur md:-mx-8 md:px-8">
            <nav aria-label="面包屑" className="flex min-w-0 items-center gap-2 text-xs text-black/45">
              <Link className="shrink-0 transition hover:text-black" to="/">工作台</Link>
              <span aria-hidden="true">/</span>
              <span className="shrink-0 text-black/70">录音记录</span>
            </nav>
            <div className="flex items-center gap-2">
              <Button className="hidden rounded-lg text-black/55 hover:bg-black/5 sm:inline-flex" onClick={() => toast.success('录音记录已刷新')} size="sm" variant="ghost">
                <RefreshCw className="size-3.5" />
                刷新
              </Button>
              <Button asChild className="rounded-lg border-black/10 bg-white/80 text-black/65 hover:bg-white" size="sm" variant="outline">
                <Link to="/">
                  <ArrowLeft className="size-3.5" />
                  返回入口
                </Link>
              </Button>
            </div>
          </header>

          <section className="py-5 md:py-7">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-700"><Archive className="size-3.5" />源文件管理</div>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">录音记录</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">录音结束后先保存，什么时候转写和生成笔记由你决定。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="rounded-lg border-black/10 bg-white text-black/65 hover:bg-white" onClick={() => setStorageOpen(true)} variant="outline">
                  <FolderCog className="size-4" />
                  本地归档设置
                </Button>
                <Button asChild className="rounded-lg bg-[#161616] text-white hover:bg-[#3370ff]">
                  <Link to="/recording-notes"><Mic2 className="size-4" />开始录音</Link>
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-lg border border-black/8 bg-white px-4 py-3"><div className="flex items-center justify-between text-xs text-black/45"><span>全部录音</span><FileAudio className="size-4 text-emerald-600" /></div><strong className="mt-2 block text-2xl">28</strong><span className="mt-1 block text-xs text-black/35">本月新增 6 条</span></article>
              <article className="rounded-lg border border-black/8 bg-white px-4 py-3"><div className="flex items-center justify-between text-xs text-black/45"><span>未处理</span><Clock3 className="size-4 text-amber-600" /></div><strong className="mt-2 block text-2xl">3</strong><span className="mt-1 block text-xs text-black/35">先处理最早的一条</span></article>
              <article className="rounded-lg border border-black/8 bg-white px-4 py-3"><div className="flex items-center justify-between text-xs text-black/45"><span>已归档</span><HardDrive className="size-4 text-blue-600" /></div><strong className="mt-2 block text-2xl">25</strong><span className="mt-1 block text-xs text-black/35">目录当前可访问</span></article>
              <article className="rounded-lg border border-black/8 bg-white px-4 py-3"><div className="flex items-center justify-between text-xs text-black/45"><span>占用空间</span><ListFilter className="size-4 text-black/45" /></div><strong className="mt-2 block text-2xl">1.8 GB</strong><span className="mt-1 block text-xs text-black/35">剩余空间 86 GB</span></article>
            </div>

            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-4.5" /></div><div><p className="text-sm font-semibold text-emerald-950">还有 3 条录音没有处理</p><p className="mt-1 text-xs leading-5 text-emerald-900/65">源文件已经保存，不会因为暂时不处理而丢失。</p></div></div>
                <Button className="self-start rounded-lg border-emerald-300 bg-white/80 text-emerald-800 hover:bg-white sm:self-auto" onClick={() => { setStatusFilter('pending'); toast.success('已筛选出未处理录音'); }} size="sm" variant="outline">查看待处理</Button>
              </div>
            </div>

            <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(21rem,.75fr)]">
              <section className="overflow-hidden rounded-lg border border-black/8 bg-white shadow-[0_8px_24px_rgba(40,35,29,0.035)]">
                <div className="flex items-center justify-between gap-3 border-b border-black/8 px-4 py-3.5"><div><h2 className="text-sm font-semibold text-black/80">全部录音</h2><p className="mt-0.5 text-xs text-black/42">按最近更新时间排序 · {visibleRecords.length} 条显示</p></div><Button className="rounded-lg px-2.5 text-black/50 hover:bg-black/5" onClick={() => toast.success('原型演示：进入批量管理')} size="sm" variant="ghost"><ListFilter className="size-3.5" />批量管理</Button></div>
                <div className="flex flex-wrap gap-2 border-b border-black/8 bg-[#fbfcfb] p-3"><div className="relative min-w-[12rem] flex-1"><Search className="absolute left-2.5 top-2.5 size-3.5 text-black/35" /><Input aria-label="搜索录音" className="h-9 border-black/10 bg-white pl-8 text-sm" onChange={(event) => setKeyword(event.target.value)} placeholder="搜索录音标题或文件名" value={keyword} /></div><select aria-label="处理状态" className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-sm text-black/60 outline-none" onChange={(event) => setStatusFilter(event.target.value as 'all' | RecordingStatus)} value={statusFilter}><option value="all">全部处理状态</option><option value="pending">未处理</option><option value="processed">已生成笔记</option><option value="failed">处理失败</option></select><select aria-label="保存状态" className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-sm text-black/60 outline-none" onChange={(event) => setStorageFilter(event.target.value as 'all' | StorageStatus)} value={storageFilter}><option value="all">全部保存状态</option><option value="archived">已归档</option><option value="pending">待归档</option></select></div>
                <div>{visibleRecords.map((record) => <button className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-3 border-b border-black/6 px-4 py-4 text-left transition last:border-b-0 hover:bg-black/[.015] ${record.id === selectedId ? 'bg-emerald-50/55 shadow-[inset_3px_0_0_#168b75]' : ''}`} key={record.id} onClick={() => setSelectedId(record.id)} type="button"><span className={`grid size-10 place-items-center rounded-lg ${record.id === selectedId ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-600'}`}><Mic2 className="size-4.5" /></span><span className="min-w-0"><strong className="block truncate text-sm font-semibold text-black/80">{record.title}</strong><span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/42"><span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{record.capturedAt}</span><span className="inline-flex items-center gap-1"><FileAudio className="size-3" />{record.duration}</span><span>{record.fileSize}</span></span><span className="mt-2 flex flex-wrap gap-1.5"><Badge className={`rounded-md border-0 px-1.5 py-0.5 text-[11px] ${record.storage === 'archived' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><span className="mr-1 inline-block size-1.5 rounded-full bg-current" />{storageLabel(record.storage)}</Badge><Badge className={`rounded-md border-0 px-1.5 py-0.5 text-[11px] ${statusClass(record.processing)}`}>{statusLabel(record.processing)}</Badge><Badge className="rounded-md border-0 bg-black/[.045] px-1.5 py-0.5 text-[11px] text-black/45">麦克风录音</Badge></span></span><span className="flex items-start gap-1 pt-1"><span className="grid size-7 place-items-center rounded-md text-black/35 hover:bg-black/5 hover:text-black/70" onClick={(event) => { event.stopPropagation(); toast.success('原型演示：播放录音'); }}><Play className="size-3.5" /></span><span className="grid size-7 place-items-center rounded-md text-black/35 hover:bg-black/5 hover:text-black/70" onClick={(event) => { event.stopPropagation(); toast.success('原型演示：更多操作'); }}><MoreHorizontal className="size-4" /></span></span></button>)}</div>
                {visibleRecords.length === 0 && <div className="px-5 py-12 text-center text-sm text-black/45">没有符合条件的录音</div>}
                <div className="flex items-center justify-between border-t border-black/8 px-4 py-3 text-xs text-black/40"><span>已加载最近记录</span><Button className="h-7 rounded-md px-2 text-xs text-black/50" onClick={() => toast.success('原型演示：加载更多录音')} size="sm" variant="ghost">加载更多</Button></div>
              </section>

              <aside className="overflow-hidden rounded-lg border border-black/8 bg-white shadow-[0_8px_24px_rgba(40,35,29,0.035)] lg:sticky lg:top-16">
                <div className="flex items-start justify-between gap-3 border-b border-black/8 px-4 py-3.5"><div><h2 className="text-sm font-semibold text-black/80">录音详情</h2><p className="mt-0.5 text-xs text-black/42">源文件和处理结果分开保留</p></div><Button className="h-7 rounded-md px-2 text-xs text-black/45" onClick={() => toast.success('原型演示：编辑标题')} size="sm" variant="ghost"><Pencil className="size-3.5" />编辑</Button></div>
                <div className="p-4"><h2 className="text-lg font-semibold leading-7 tracking-tight">{selected.title}</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/45"><span>{selected.capturedAt}</span><span>{selected.duration}</span><span>麦克风录音</span></div><div className="mt-5 rounded-lg border border-black/8 bg-[#fbfcfb] p-3"><div className="flex h-10 items-center gap-1 overflow-hidden" aria-hidden="true">{[18,28,12,34,23,39,17,29,43,22,14,33,26,37,18,30,42,25,16,36,30,20,44,27,13,32,22,38,18,31,24,42,28,14,35,21,39,25,17,30,22,36,18,29,41,24,14,34,27,38,18,31,23,43,26,16,33,22,37,17,29,40].map((height, index) => <i className={`w-1 shrink-0 rounded-full ${index % 3 === 0 ? 'bg-emerald-500' : 'bg-emerald-200'}`} key={index} style={{ height: `${height}%` }} />)}</div><div className="mt-3 flex items-center gap-2"><Button aria-label={playing ? '暂停播放' : '播放录音'} className="size-8 rounded-full bg-emerald-600 p-0 text-white hover:bg-emerald-700" onClick={() => setPlaying((value) => !value)} size="icon">{playing ? <Pause className="size-3.5" /> : <Play className="ml-0.5 size-3.5" />}</Button><div className="h-1 flex-1 overflow-hidden rounded-full bg-emerald-100"><i className="block h-full w-[31%] rounded-full bg-emerald-600" /></div><span className="text-[11px] tabular-nums text-black/45">13:08 / {selected.duration.replace(' 分 ', ':').replace(' 秒', '')}</span></div></div>
                  <section className="mt-5"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-black/40">保存位置</span><Button className="h-6 rounded-md px-1.5 text-[11px] text-black/45" onClick={() => toast.success('已加入归档队列')} size="sm" variant="ghost"><RefreshCw className="size-3" />重新归档</Button></div><div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${selected.storage === 'archived' ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}><FolderOpen className={`mt-0.5 size-4 shrink-0 ${selected.storage === 'archived' ? 'text-emerald-700' : 'text-amber-700'}`} /><div className="min-w-0 flex-1"><strong className={`block truncate text-xs ${selected.storage === 'archived' ? 'text-emerald-800' : 'text-amber-800'}`}>{archivePath}\\09\\{selected.fileName}</strong><small className="mt-1 block text-[11px] text-black/45">{selected.storage === 'archived' ? '应用内副本 + 本地归档副本' : '应用内副本已保存，本地目录等待连接'}</small></div><span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${selected.storage === 'archived' ? 'text-emerald-700' : 'text-amber-700'}`}>{selected.storage === 'archived' ? <CheckCircle2 className="size-3.5" /> : <TriangleAlert className="size-3.5" />}{storageLabel(selected.storage)}</span></div></section>
                  <section className="mt-5"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-black/40">处理历史</span><span className="text-[11px] text-black/35">{selected.processing === 'processed' ? '2 个版本' : '1 个版本'}</span></div><div className="space-y-3"><div className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Check className="size-3" /></span><div className="min-w-0"><strong className="block text-xs">录音已保存</strong><small className="mt-0.5 block text-[11px] leading-4 text-black/45">应用内副本已写入，原始文件保持不变</small></div><span className="ml-auto text-[11px] text-black/30">14:19</span></div><div className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full border border-black/10 text-black/25"><Settings2 className="size-3" /></span><div className="min-w-0"><strong className="block text-xs">{selected.processing === 'processed' ? '已生成会议纪要' : selected.processing === 'failed' ? '上次处理失败' : '等待处理'}</strong><small className="mt-0.5 block text-[11px] leading-4 text-black/45">{selected.processing === 'failed' ? '源文件仍可播放，可修改配置后重试' : selected.processing === 'processed' ? '可查看笔记或重新生成其他风格' : '选择转写方式后生成笔记'}</small></div><span className="ml-auto text-[11px] text-black/30">现在</span></div></div></section>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2"><Button className="sm:col-span-2 rounded-lg bg-[#161616] text-white hover:bg-[#3370ff]" disabled={processing || selected.processing === 'processed'} onClick={startProcessing}>{processing ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{processing ? '正在创建任务' : selected.processing === 'failed' ? '重新提交处理' : '开始转写并生成笔记'}</Button><Button className="rounded-lg border-black/10 text-black/60" onClick={() => toast.success('原型演示：下载录音')} variant="outline"><Download className="size-4" />下载录音</Button><Button className="rounded-lg border-black/10 text-black/60" onClick={() => toast.success('原型演示：打开更多操作')} variant="outline"><MoreHorizontal className="size-4" />更多操作</Button></div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </div>

      <Dialog onOpenChange={setStorageOpen} open={storageOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>本地录音存储</DialogTitle><DialogDescription>录音会先保存到应用内，再复制到你授权的电脑目录。</DialogDescription></DialogHeader><div className="space-y-4 py-1"><div className="space-y-2"><label className="text-sm font-medium" htmlFor="archive-path">归档目录</label><Input id="archive-path" onChange={(event) => setArchivePath(event.target.value)} value={archivePath} /><p className="text-xs leading-5 text-black/45">目录不可用时，录音仍保留在应用内，并在记录中标记为“待归档”。</p></div><div className="flex items-center justify-between rounded-lg border border-black/8 bg-black/[.015] p-3"><div><p className="text-sm font-medium">录音完成后自动归档</p><p className="mt-1 text-xs text-black/45">{autoArchive ? '开启 · 复制到目录并保留应用内副本' : '关闭 · 仅保存到应用内'}</p></div><Switch checked={autoArchive} onCheckedChange={setAutoArchive} /></div><div className="flex items-center justify-between rounded-lg border border-black/8 bg-black/[.015] p-3"><div><p className="text-sm font-medium">归档前检查磁盘空间</p><p className="mt-1 text-xs text-black/45">空间不足时暂停归档，不影响录音保存</p></div><Switch defaultChecked /></div></div><DialogFooter><Button onClick={() => toast.success('目录可写，剩余空间 86 GB')} variant="outline"><HardDrive className="size-4" />测试目录</Button><Button onClick={() => { setStorageOpen(false); toast.success('本地归档设置已保存'); }}><CheckCircle2 className="size-4" />保存设置</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
