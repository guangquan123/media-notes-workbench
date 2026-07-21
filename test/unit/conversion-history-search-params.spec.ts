import {
  buildConversionHistorySearchParams,
} from '../../client/src/pages/ConversionHistoryPage/conversion-history-search-params';

describe('conversion history search parameters', () => {
  it('keeps the target job when the page synchronizes its URL state', () => {
    const params: URLSearchParams = buildConversionHistorySearchParams({
      jobId: '4a576104-cebf-426e-aff1-f6be4110c300',
      page: 1,
    });

    expect(params.toString()).toBe(
      'jobId=4a576104-cebf-426e-aff1-f6be4110c300',
    );
  });

  it('keeps the Feishu source filter alongside other active filters', () => {
    const params: URLSearchParams = buildConversionHistorySearchParams({
      page: 2,
      sourceChannel: 'feishu_inbox',
      status: 'completed',
    });

    expect(params.toString()).toBe(
      'sourceChannel=feishu_inbox&status=completed&page=2',
    );
  });
});
