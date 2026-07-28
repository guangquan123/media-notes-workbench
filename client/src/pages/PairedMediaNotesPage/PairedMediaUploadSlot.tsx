import { UploadCloud, X, type LucideIcon } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/utils/file-size';
import { MAX_PAIRED_MEDIA_SIZE } from './paired-media-page.utils';

interface PairedMediaUploadSlotProps {
  accept: Record<string, string[]>;
  disabled: boolean;
  file: File | null;
  hint: string;
  icon: LucideIcon;
  label: string;
  onChange: (file: File | null) => void;
}

export function PairedMediaUploadSlot({
  accept,
  disabled,
  file,
  hint,
  icon: Icon,
  label,
  onChange,
}: PairedMediaUploadSlotProps) {
  const dropzone = useDropzone({
    accept,
    disabled,
    maxFiles: 1,
    maxSize: MAX_PAIRED_MEDIA_SIZE,
    onDropAccepted: (acceptedFiles: File[]) =>
      onChange(acceptedFiles[0] || null),
    onDropRejected: () => toast.error(`${label}格式不支持或超过 10 GB`),
  });
  return (
    <div className="rounded-2xl border border-black/8 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-[#eef1ff] text-[#4d5dff]">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-black/42">{hint}</p>
        </div>
      </div>
      {file ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#f7f7f5] p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="mt-0.5 text-xs text-black/38">
              {formatFileSize(file.size)}
            </p>
          </div>
          <Button
            aria-label={`移除${label}`}
            disabled={disabled}
            onClick={() => onChange(null)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div
          {...dropzone.getRootProps()}
          className={`mt-4 cursor-pointer rounded-2xl border border-dashed px-4 py-7 text-center transition ${
            dropzone.isDragActive
              ? 'border-[#4d5dff] bg-[#f4f5ff]'
              : 'border-black/15 bg-[#fafaf8] hover:border-black/25'
          }`}
        >
          <input {...dropzone.getInputProps()} />
          <UploadCloud className="mx-auto size-5 text-black/35" />
          <p className="mt-2 text-xs text-black/48">拖入文件，或点击选择</p>
        </div>
      )}
    </div>
  );
}
