import {
  FastForward,
  Pause,
  Play,
  Rewind,
  Volume2,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FC,
} from 'react';
import {
  findSmartPlaybackSkip,
  type SmartPlaybackSkipSegment,
} from '@/utils/recording-audio-analysis';

interface RecordingAudioPlayerProps {
  ariaLabel?: string;
  className?: string;
  durationMs?: number | null;
  skipSegments?: SmartPlaybackSkipSegment[];
  smartPlayback?: boolean;
  src: string | null;
}

const SEEK_STEP_SECONDS = 10;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds: number): string {
  const safeSeconds: number = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0;
  const hours: number = Math.floor(safeSeconds / 3_600);
  const minutes: number = Math.floor((safeSeconds % 3_600) / 60);
  const remainder: number = safeSeconds % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${remainder
    .toString()
    .padStart(2, '0')}`;
}

const RecordingAudioPlayer: FC<RecordingAudioPlayerProps> = ({
  ariaLabel = '录音播放器',
  className = '',
  durationMs,
  skipSegments = [],
  smartPlayback = false,
  src,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const smartSkipTimerRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(
    durationMs && durationMs > 0 ? durationMs / 1_000 : 0,
  );
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [hasError, setHasError] = useState<boolean>(false);
  const [lastSmartSkip, setLastSmartSkip] = useState<string | null>(null);

  useEffect(() => {
    const audio: HTMLAudioElement | null = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setHasError(false);
    setLastSmartSkip(null);
    setDuration(durationMs && durationMs > 0 ? durationMs / 1_000 : 0);
    if (smartSkipTimerRef.current !== null) {
      window.clearTimeout(smartSkipTimerRef.current);
      smartSkipTimerRef.current = null;
    }
  }, [durationMs, src]);

  useEffect(
    () => () => {
      if (smartSkipTimerRef.current !== null) {
        window.clearTimeout(smartSkipTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (smartSkipTimerRef.current === null) return;
    window.clearTimeout(smartSkipTimerRef.current);
    smartSkipTimerRef.current = null;
  }, [skipSegments, smartPlayback]);

  const cancelPendingSmartSkip = (): void => {
    if (smartSkipTimerRef.current !== null) {
      window.clearTimeout(smartSkipTimerRef.current);
      smartSkipTimerRef.current = null;
    }
  };

  const togglePlayback = (): void => {
    const audio: HTMLAudioElement | null = audioRef.current;
    if (!audio || !src) return;
    cancelPendingSmartSkip();
    if (audio.paused) {
      void audio.play().catch(() => setHasError(true));
      return;
    }
    audio.pause();
  };

  const seekBy = (offsetSeconds: number): void => {
    const audio: HTMLAudioElement | null = audioRef.current;
    if (!audio) return;
    cancelPendingSmartSkip();
    const maxTime: number = Number.isFinite(audio.duration)
      ? audio.duration
      : duration;
    audio.currentTime = Math.min(
      Math.max(0, audio.currentTime + offsetSeconds),
      maxTime || Number.MAX_SAFE_INTEGER,
    );
    setCurrentTime(audio.currentTime);
  };

  const handleProgressChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextTime: number = Number(event.target.value);
    const audio: HTMLAudioElement | null = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) return;
    cancelPendingSmartSkip();
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleRateChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const nextRate: number = Number(event.target.value);
    if (!Number.isFinite(nextRate)) return;
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  };

  const skipQuietSegment = (sourcePositionMs: number): void => {
    const audio: HTMLAudioElement | null = audioRef.current;
    if (!audio || !smartPlayback || audio.paused) return;
    const segment: SmartPlaybackSkipSegment | null = findSmartPlaybackSkip(
      sourcePositionMs,
      skipSegments,
    );
    if (!segment || smartSkipTimerRef.current !== null) return;
    audio.pause();
    setLastSmartSkip(
      `已跳过 ${formatTime(segment.sourceEndMs / 1_000 - segment.sourceStartMs / 1_000)} 安静片段`,
    );
    smartSkipTimerRef.current = window.setTimeout(() => {
      const currentAudio: HTMLAudioElement | null = audioRef.current;
      if (!currentAudio) return;
      currentAudio.currentTime = segment.sourceEndMs / 1_000;
      setCurrentTime(currentAudio.currentTime);
      smartSkipTimerRef.current = null;
      void currentAudio.play().catch(() => setHasError(true));
    }, 650);
  };

  const progressMax: number = Math.max(duration, 0.01);
  const progressPercent: number = Math.min(
    100,
    Math.max(0, (currentTime / progressMax) * 100),
  );

  return (
    <div
      aria-label={ariaLabel}
      className={`recording-audio-player ${className}`.trim()}
      role="group"
    >
      <audio
        aria-label={ariaLabel}
        onCanPlay={() => setHasError(false)}
        onDurationChange={(event) => {
          const nextDuration: number = event.currentTarget.duration;
          if (Number.isFinite(nextDuration) && nextDuration > 0) {
            setDuration(nextDuration);
          }
        }}
        onEnded={() => {
          if (audioRef.current) audioRef.current.currentTime = 0;
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => setHasError(true)}
        onLoadedMetadata={(event) => {
          const nextDuration: number = event.currentTarget.duration;
          if (Number.isFinite(nextDuration) && nextDuration > 0) {
            setDuration(nextDuration);
          }
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
          skipQuietSegment(event.currentTarget.currentTime * 1_000);
        }}
        preload="metadata"
        ref={audioRef}
        src={src || undefined}
      />
      <div className="recording-audio-player__controls">
        <button
          aria-label={`后退 ${SEEK_STEP_SECONDS} 秒`}
          className="recording-audio-player__icon-button"
          disabled={!src}
          onClick={() => seekBy(-SEEK_STEP_SECONDS)}
          title={`后退 ${SEEK_STEP_SECONDS} 秒`}
          type="button"
        >
          <Rewind className="size-4" />
        </button>
        <button
          aria-label={isPlaying ? '暂停录音' : '播放录音'}
          className="recording-audio-player__play-button"
          disabled={!src}
          onClick={togglePlayback}
          title={isPlaying ? '暂停录音' : '播放录音'}
          type="button"
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button
          aria-label={`前进 ${SEEK_STEP_SECONDS} 秒`}
          className="recording-audio-player__icon-button"
          disabled={!src}
          onClick={() => seekBy(SEEK_STEP_SECONDS)}
          title={`前进 ${SEEK_STEP_SECONDS} 秒`}
          type="button"
        >
          <FastForward className="size-4" />
        </button>
        <div className="recording-audio-player__timeline">
          <input
            aria-label="录音播放进度"
            className="recording-audio-player__range"
            disabled={!src || duration <= 0}
            max={progressMax}
            min="0"
            onChange={handleProgressChange}
            style={{ '--recording-progress': `${progressPercent}%` } as CSSProperties}
            step="0.1"
            type="range"
            value={Math.min(currentTime, progressMax)}
          />
          <div className="recording-audio-player__time" aria-live="polite">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <Volume2 className="recording-audio-player__volume" aria-hidden="true" />
        <label className="recording-audio-player__rate">
          <span className="sr-only">播放速度</span>
          <select aria-label="播放速度" onChange={handleRateChange} value={playbackRate}>
            {PLAYBACK_RATES.map((rate: number) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </label>
      </div>
      {hasError && (
        <p className="recording-audio-player__error" role="alert">
          音频加载失败，请检查文件是否仍可访问。
        </p>
      )}
      {lastSmartSkip && (
        <p aria-live="polite" className="sr-only">
          {lastSmartSkip}
        </p>
      )}
    </div>
  );
};

export default RecordingAudioPlayer;
