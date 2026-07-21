import type {
  ConversionStatus,
  NoteProcessingStatus,
  NoteSourceType,
} from '@shared/api.interface';

export type ConversionSourceChannel = 'feishu_inbox' | 'manual';

export interface ConversionHistorySearchState {
  dateFrom?: string;
  dateTo?: string;
  jobId?: string;
  keyword?: string;
  page: number;
  processingStatus?: NoteProcessingStatus;
  sourceChannel?: ConversionSourceChannel;
  sourceType?: NoteSourceType;
  status?: ConversionStatus;
}

export function buildConversionHistorySearchParams(
  state: ConversionHistorySearchState,
): URLSearchParams {
  const params: URLSearchParams = new URLSearchParams();
  if (state.jobId) params.set('jobId', state.jobId);
  if (state.keyword) params.set('keyword', state.keyword);
  if (state.sourceChannel) {
    params.set('sourceChannel', state.sourceChannel);
  }
  if (state.sourceType) params.set('sourceType', state.sourceType);
  if (state.status) params.set('status', state.status);
  if (state.processingStatus) {
    params.set('processingStatus', state.processingStatus);
  }
  if (state.dateFrom) params.set('dateFrom', state.dateFrom);
  if (state.dateTo) params.set('dateTo', state.dateTo);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}
