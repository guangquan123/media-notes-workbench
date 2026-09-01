import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpRight, BookOpenText, Check, CheckCheck, ChevronDown,
  ChevronUp, Circle, FilePenLine, Info, LoaderCircle, LockKeyhole, Mic,
  Mic2, Pause, Play, RotateCcw, RotateCw, Save, ShieldCheck, SlidersHorizontal,
  Sparkles, Square, TriangleAlert, UsersRound, Volume2,
} from 'lucide-react';

const NOTE_STYLES = [
  { id: 'learning', label: '学习笔记', detail: '重点、结构与行动清单', icon: 'book-open-text' },
  { id: 'meeting', label: '会议纪要', detail: '议题、决策、待办与责任人', icon: 'users-round' },
];

const initialAdvanced = { audio: '原声保真（推荐）', language: '自动识别（推荐）', hotwords: '' };

const ICONS = { ArrowLeft, ArrowUpRight, BookOpenText, Check, CheckCheck, ChevronDown, ChevronUp, Circle, FilePenLine, Info, LoaderCircle, LockKeyhole, Mic, Mic2, Pause, Play, RotateCcw, RotateCw, Save, ShieldCheck, SlidersHorizontal, Sparkles, Square, TriangleAlert, UsersRound, Volume2 };
const ICON_ALIASES = { 'arrow-left': 'ArrowLeft', 'arrow-up-right': 'ArrowUpRight', 'book-open-text': 'BookOpenText', check: 'Check', 'check-check': 'CheckCheck', 'chevron-down': 'ChevronDown', 'chevron-up': 'ChevronUp', circle: 'Circle', 'file-pen-line': 'FilePenLine', info: 'Info', 'loader-circle': 'LoaderCircle', 'lock-keyhole': 'LockKeyhole', mic: 'Mic', 'mic-2': 'Mic2', pause: 'Pause', play: 'Play', 'rotate-ccw': 'RotateCcw', 'rotate-cw': 'RotateCw', save: 'Save', 'shield-check': 'ShieldCheck', 'sliders-horizontal': 'SlidersHorizontal', sparkles: 'Sparkles', square: 'Square', 'triangle-alert': 'TriangleAlert', 'users-round': 'UsersRound', 'volume-2': 'Volume2' };
function Icon({ name, size = 18 }) {
  const Component = ICONS[ICON_ALIASES[name]] || Circle;
  return <Component aria-hidden="true" size={size} strokeWidth={2} />;
}

function StepRail({ phase }) {
  const step = phase === 'prepare' ? 0 : phase === 'review' ? 2 : 1;
  const steps = ['准备', '录音', '确认'];
  return <div className="step-rail" aria-label={`当前步骤：${steps[step]}`}>{steps.map((label, index) => <div className="step-item" key={label}><div className={`step-node ${index < step ? 'is-done' : ''} ${index === step ? 'is-current' : ''}`}>{index < step ? <Icon name="check" size={16} /> : index + 1}</div><span className={index === step ? 'is-current' : ''}>{label}</span>{index < steps.length - 1 && <span className={`step-line ${index < step ? 'is-done' : ''}`} aria-hidden="true" />}</div>)}</div>;
}

function MicStatus({ micState, onRetry }) {
  const copy = {
    idle: ['先测试麦克风', '点击检测，确认设备和声音输入正常。', 'neutral'],
    connecting: ['正在连接麦克风…', '请在浏览器弹窗中允许麦克风访问。', 'loading'],
    listening: ['请说一句话测试', '我们正在监听声音输入，音量条有变化就说明工作正常。', 'listening'],
    success: ['声音已检测到，可以开始录音', '设备连接正常，录音时会持续显示声音状态。', 'success'],
    timeout: ['还没检测到声音', '请靠近麦克风说话，或检查系统是否静音。', 'warning'],
    error: ['麦克风暂时不可用', '请允许浏览器访问麦克风后重新检测。', 'error'],
  }[micState];
  const activeStep = micState === 'idle' || micState === 'connecting' ? 0 : micState === 'listening' || micState === 'timeout' ? 1 : 2;
  return <section className={`mic-test mic-test--${copy[2]}`} aria-live={micState === 'error' ? 'assertive' : 'polite'}><div className="mic-test__header"><div><p className="section-kicker">麦克风测试</p><h2>{copy[0]}</h2><p className="section-copy">{copy[1]}</p></div>{micState !== 'connecting' && micState !== 'listening' && <button className="button button--ghost button--small" type="button" onClick={onRetry}><Icon name="rotate-cw" size={15} /> {micState === 'idle' ? '检测麦克风' : '重新检测'}</button>}</div><div className="mic-steps" aria-label="麦克风检测进度">{['连接设备', '请说话', '可以开始'].map((label, index) => <div className="mic-step" key={label}><div className={`mic-step__node ${index < activeStep ? 'is-done' : ''} ${index === activeStep ? 'is-active' : ''}`}>{index < activeStep ? <Icon name="check" size={15} /> : index === 1 && activeStep === 1 ? <Icon name="mic-2" size={16} /> : index + 1}</div><div className="mic-step__label"><strong>{label}</strong><span>{index === 0 ? (activeStep > 0 ? '麦克风已连接' : '等待连接') : index === 1 ? (activeStep > 1 ? '声音输入正常' : activeStep === 1 ? '正在检测声音' : '待完成') : (activeStep === 2 ? '声音检测通过' : '待完成')}</span></div>{index < 2 && <span className={`mic-step__line ${index < activeStep ? 'is-done' : ''}`} aria-hidden="true" />}</div>)}</div><div className="meter-row"><div className="meter-label"><Icon name="mic-2" size={19} /><span>实时音量</span></div><div className="meter" aria-label={micState === 'success' ? '当前输入音量 62%，声音正常' : '等待声音输入'}>{Array.from({ length: 34 }, (_, index) => <span key={index} className={(micState === 'success' || micState === 'listening') && index < (micState === 'success' ? 22 : 9) ? 'is-on' : ''} style={{ '--bar-delay': `${index * 25}ms` }} />)}</div><span className="meter-status">{micState === 'success' ? '声音正常' : micState === 'listening' ? '监听中' : '等待输入'}</span></div>{micState === 'timeout' && <div className="inline-alert inline-alert--warning"><Icon name="info" size={16} /> 说话时靠近麦克风约 20 厘米，看到绿色音量条再开始。</div>}{micState === 'error' && <div className="inline-alert inline-alert--error"><Icon name="triangle-alert" size={16} /> 麦克风权限未开启。请点击地址栏的麦克风图标允许访问，再重新检测。</div>}</section>;
}

function Preparation({ title, setTitle, noteStyle, setNoteStyle, advancedOpen, setAdvancedOpen, advanced, setAdvanced, micState, startMicTest, startRecording }) {
  const canStart = micState === 'success';
  return <>
    <div className="intro-block">
      <div>
        <p className="section-kicker">录音笔记</p>
        <h1>开始一段新录音</h1>
        <p className="intro-copy">设置标题，先确认麦克风，再开始录音。</p>
      </div>
      <div className="intro-icon"><Icon name="mic-2" size={24} /></div>
    </div>

    <div className="prepare-columns">
      <section className="prepare-config" aria-labelledby="record-config-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">录音设置</p>
            <h2 id="record-config-title">先把这段录音准备好</h2>
          </div>
          <span className="section-count">1 / 2</span>
        </div>

        <div className="form-grid">
          <label className="field field--full">
            <span>录音标题</span>
            <div className="input-wrap">
              <Icon name="file-pen-line" size={17} />
              <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
              <small>{title.length}/80</small>
            </div>
          </label>

          <div className="field field--full">
            <span>笔记风格</span>
            <div className="style-options" role="group" aria-label="选择笔记风格">
              {NOTE_STYLES.map((style) => <button key={style.id} type="button" className={`style-option ${noteStyle === style.id ? 'is-selected' : ''}`} onClick={() => setNoteStyle(style.id)}><Icon name={style.icon} size={20} /><span><strong>{style.label}</strong><small>{style.detail}</small></span><span className="radio-dot" aria-hidden="true" /></button>)}
            </div>
          </div>
        </div>

        <button className="advanced-toggle" type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(!advancedOpen)}>
          <span><Icon name="sliders-horizontal" size={17} /><strong>高级设置</strong><small>录音模式、语言、热词</small></span>
          <Icon name={advancedOpen ? 'chevron-up' : 'chevron-down'} size={18} />
        </button>
        {advancedOpen && <div className="advanced-panel">
          <label className="field"><span>录音模式</span><select value={advanced.audio} onChange={(event) => setAdvanced({ ...advanced, audio: event.target.value })}><option>原声保真（推荐）</option><option>会议清晰（回声/多人）</option><option>强噪增强（街道/风扇）</option></select></label>
          <label className="field"><span>语言模式</span><select value={advanced.language} onChange={(event) => setAdvanced({ ...advanced, language: event.target.value })}><option>自动识别（推荐）</option><option>普通话</option><option>粤语</option><option>普通话 + 英语</option></select></label>
          <label className="field field--full"><span>热词（可选）</span><input value={advanced.hotwords} placeholder="人名、项目名、术语，用逗号分隔" onChange={(event) => setAdvanced({ ...advanced, hotwords: event.target.value })} /></label>
        </div>}
      </section>

      <div className="prepare-check">
        <MicStatus micState={micState} onRetry={startMicTest} />
      </div>
    </div>

    <div className="prepare-footer">
      <div className="action-row action-row--primary">
        <button className="button button--primary button--wide" type="button" disabled={!canStart} onClick={startRecording}><Icon name="mic" size={19} /> 开始录音</button>
        {!canStart && <span className="action-hint">{micState === 'idle' ? '完成右侧麦克风检测后才能开始' : micState === 'connecting' ? '正在连接设备…' : micState === 'listening' || micState === 'timeout' ? '请先说话，确认有声音输入' : '请重新检测麦克风'}</span>}
      </div>
      <p className="privacy-note"><Icon name="shield-check" size={16} /> 录音前不会采集声音；完成后可先试听，再决定是否转为笔记。</p>
    </div>
  </>;
}

function Recording({ title, elapsed, setElapsed, paused, setPaused, finishRecording }) {
  useEffect(() => { if (paused) return undefined; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [paused, setElapsed]);
  const time = new Date(elapsed * 1000).toISOString().slice(11, 19);
  return <div className="recording-state"><div className="state-header"><div><p className="section-kicker">正在录音</p><h1>{title || '未命名录音'}</h1></div><span className={`state-chip ${paused ? 'state-chip--warning' : ''}`}><span className="pulse-dot" /> {paused ? '已暂停' : '录音中'}</span></div><div className="recording-stage"><div className="record-orb"><Icon name={paused ? 'pause' : 'mic-2'} size={34} /></div><div className="record-time">{time}</div><div className={`record-status ${paused ? 'record-status--warning' : ''}`}><span className="status-dot" /> {paused ? '录音已暂停，内容不会丢失' : '声音正常，正在持续保存'}</div><div className="live-wave" aria-label="实时输入音量">{Array.from({ length: 40 }, (_, index) => <span key={index} style={{ '--wave-height': `${18 + ((index * 13) % 30)}px`, '--wave-delay': `${index * 28}ms` }} />)}</div><div className="record-controls"><button className="button button--secondary" type="button" onClick={() => setPaused(!paused)}><Icon name={paused ? 'play' : 'pause'} size={17} /> {paused ? '继续录音' : '暂停'}</button><button className="button button--primary" type="button" onClick={finishRecording}><Icon name="square" size={16} /> 完成录音</button></div></div><div className="recording-foot"><span><Icon name="save" size={15} /> 自动保存中</span><span><Icon name="volume-2" size={15} /> 音量正常</span></div></div>;
}

function Review({ title, elapsed, playing, setPlaying, convert }) {
  const [progress, setProgress] = useState(24);
  useEffect(() => { if (!playing) return undefined; const timer = window.setInterval(() => setProgress((value) => { if (value >= 100) { setPlaying(false); return 100; } return value + 4; }), 220); return () => window.clearInterval(timer); }, [playing, setPlaying]);
  const time = new Date(elapsed * 1000).toISOString().slice(11, 19);
  return <div className="review-state"><div className="state-header"><div><p className="section-kicker">录音完成</p><h1>先试听，再转为笔记</h1><p className="intro-copy">确认声音完整后，再开始转化。</p></div><span className="state-chip state-chip--success"><Icon name="check" size={15} /> 已保存</span></div><div className="audio-card"><div className="audio-main"><button className="audio-play" type="button" aria-label={playing ? '暂停试听' : '播放试听'} onClick={() => setPlaying(!playing)}><Icon name={playing ? 'pause' : 'play'} size={18} /></button><div className="audio-track"><div className="audio-track__bar"><span style={{ width: `${progress}%` }} /></div><div className="audio-track__meta"><span>{new Date(progress / 100 * elapsed * 1000).toISOString().slice(11, 19)}</span><span>{time}</span></div></div><Icon name="volume-2" size={18} /></div><div className="audio-summary"><span><strong>声音质量</strong><em className="text-success">已检测到有效声音</em></span><span><strong>录音标题</strong><em>{title || '未命名录音'}</em></span></div></div><div className="review-check"><Icon name="shield-check" size={17} /><span>请确认没有断音、明显杂音或漏录，再开始转化。</span></div><div className="action-row"><button className="button button--secondary" type="button" onClick={() => window.location.reload()}><Icon name="rotate-ccw" size={17} /> 重新录音</button><button className="button button--primary" type="button" onClick={convert}><Icon name="sparkles" size={17} /> 转为笔记</button></div></div>;
}

function Processing({ progress, setProgress, reset }) {
  useEffect(() => { const timer = window.setInterval(() => setProgress((value) => { if (value >= 100) return 100; return value + 7; }), 420); return () => window.clearInterval(timer); }, [setProgress]);
  const complete = progress >= 100;
  return <div className="processing-state"><div className="state-header"><div><p className="section-kicker">{complete ? '处理完成' : '正在生成笔记'}</p><h1>{complete ? '笔记已经准备好' : '正在把录音变成笔记'}</h1><p className="intro-copy">{complete ? '结构化笔记已生成，可以打开查看。' : '你可以先离开页面，任务会继续处理。'}</p></div><span className={`state-chip ${complete ? 'state-chip--success' : ''}`}><span className="pulse-dot" /> {complete ? '已完成' : '处理中'}</span></div>{complete ? <div className="complete-card"><div className="complete-icon"><Icon name="check-check" size={28} /></div><h2>录音已成功转为笔记</h2><p>会议纪要 · 重点、决策与待办已整理完成</p><button className="button button--primary" type="button"><Icon name="arrow-up-right" size={17} /> 打开总结笔记</button><button className="button button--secondary" type="button" onClick={reset}>再录一段</button></div> : <div className="progress-card"><div className="progress-row"><strong>{progress < 35 ? '安全上传录音' : progress < 75 ? '语音转文字' : '生成结构化笔记'}</strong><span>{progress}%</span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="process-steps"><span className={progress >= 35 ? 'is-done' : 'is-current'}><Icon name={progress >= 35 ? 'check' : 'loader-circle'} size={15} /> 上传录音</span><span className={progress >= 75 ? 'is-done' : progress >= 35 ? 'is-current' : ''}><Icon name={progress >= 75 ? 'check' : 'circle'} size={15} /> 转写内容</span><span className={progress >= 100 ? 'is-done' : progress >= 75 ? 'is-current' : ''}><Icon name={progress >= 100 ? 'check' : 'circle'} size={15} /> 整理笔记</span></div><button className="button button--secondary" type="button" onClick={reset}>返回录音</button></div>}</div>;
}

export function App() {
  const [phase, setPhase] = useState('prepare'); const [title, setTitle] = useState('录音笔记 2026-08-31 22-02'); const [noteStyle, setNoteStyle] = useState('meeting'); const [micState, setMicState] = useState('idle'); const [advancedOpen, setAdvancedOpen] = useState(false); const [advanced, setAdvanced] = useState(initialAdvanced); const [elapsed, setElapsed] = useState(0); const [paused, setPaused] = useState(false); const [playing, setPlaying] = useState(false); const [progress, setProgress] = useState(12); const timers = useRef([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  const clearTimers = () => { timers.current.forEach((timer) => window.clearTimeout(timer)); timers.current = []; }; const startMicTest = () => { clearTimers(); setMicState('connecting'); timers.current.push(window.setTimeout(() => setMicState('listening'), 900)); timers.current.push(window.setTimeout(() => setMicState('success'), 3000)); }; const startRecording = () => { clearTimers(); setElapsed(0); setPaused(false); setPhase('recording'); }; const finishRecording = () => { clearTimers(); setPaused(false); setPhase('review'); }; const convert = () => { setProgress(12); setPhase('processing'); }; const reset = () => { clearTimers(); setPhase('prepare'); setMicState('idle'); setElapsed(0); setPaused(false); setPlaying(false); setProgress(12); };
  return <main className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Icon name="mic-2" size={20} /></span><span><strong>实时录音笔记</strong><small>录音、试听、转录、整理</small></span></div><button className="button button--ghost" type="button" onClick={reset}><Icon name="arrow-left" size={16} /> 返回入口</button></header><section className="workspace"><div className="surface"><StepRail phase={phase} />{phase === 'prepare' && <Preparation title={title} setTitle={setTitle} noteStyle={noteStyle} setNoteStyle={setNoteStyle} advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen} advanced={advanced} setAdvanced={setAdvanced} micState={micState} startMicTest={startMicTest} startRecording={startRecording} />}{phase === 'recording' && <Recording title={title} elapsed={elapsed} setElapsed={setElapsed} paused={paused} setPaused={setPaused} finishRecording={finishRecording} />}{phase === 'review' && <Review title={title} elapsed={elapsed} playing={playing} setPlaying={setPlaying} convert={convert} />}{phase === 'processing' && <Processing progress={progress} setProgress={setProgress} reset={reset} />}</div></section><footer className="footer-note"><Icon name="lock-keyhole" size={15} /> 录音前不会采集声音，完成后再决定是否转为笔记</footer></main>;
}
