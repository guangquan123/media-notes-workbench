import {
  describeExternalModelResponse,
  extractExternalModelText,
  getExternalModelOutputTokenBudgets,
  isReasoningOnlyLengthLimitedResponse,
} from '../../server/modules/note-jobs/external-model-response.utils';

describe('external model response utilities', () => {
  it('extracts text from OpenAI-compatible content parts', () => {
    expect(
      extractExternalModelText({
        choices: [
          {
            message: {
              content: [{ text: '第一段' }, { type: 'text', text: '第二段' }],
            },
          },
        ],
      }),
    ).toBe('第一段第二段');
  });

  it('does not mistake reasoning content for the final answer', () => {
    const payload = {
      choices: [
        {
          finish_reason: 'length',
          message: {
            content: '',
            reasoning_content: '内部推理',
            role: 'assistant',
          },
        },
      ],
    };
    expect(extractExternalModelText(payload)).toBeUndefined();
    expect(isReasoningOnlyLengthLimitedResponse(payload)).toBe(true);
    expect(describeExternalModelResponse(payload)).toEqual({
      choicesCount: 1,
      finishReason: 'length',
      messageKeys: ['content', 'reasoning_content', 'role'],
    });
  });

  it('only treats length-limited reasoning-only responses as recoverable', () => {
    expect(
      isReasoningOnlyLengthLimitedResponse({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: '', reasoning_content: '内部推理' },
          },
        ],
      }),
    ).toBe(false);
  });

  it('uses a bounded output-budget escalation sequence', () => {
    expect(getExternalModelOutputTokenBudgets(64)).toEqual([64, 32_768, 65_536]);
    expect(getExternalModelOutputTokenBudgets(32_768)).toEqual([
      32_768,
      65_536,
    ]);
    expect(getExternalModelOutputTokenBudgets(65_536)).toEqual([65_536]);
  });
});
