import {
  describeExternalModelResponse,
  extractExternalModelText,
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
    expect(describeExternalModelResponse(payload)).toEqual({
      choicesCount: 1,
      finishReason: 'length',
      messageKeys: ['content', 'reasoning_content', 'role'],
    });
  });
});
