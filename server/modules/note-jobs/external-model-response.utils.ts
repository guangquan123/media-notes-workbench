export interface ExternalModelResponseMetadata {
  choicesCount: number;
  finishReason?: string;
  messageKeys: string[];
}

export function extractExternalModelText(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;

  const choices: unknown = payload.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice: unknown = choices[0];
    if (isRecord(firstChoice)) {
      const message: unknown = firstChoice.message;
      if (isRecord(message)) {
        const messageText: string | undefined = extractTextValue(
          message.content,
        );
        if (messageText) return messageText;
      }
      const completionText: string | undefined = extractTextValue(
        firstChoice.text,
      );
      if (completionText) return completionText;
    }
  }

  return extractTextValue(payload.output_text);
}

export function describeExternalModelResponse(
  payload: unknown,
): ExternalModelResponseMetadata {
  if (!isRecord(payload)) {
    return { choicesCount: 0, messageKeys: [] };
  }
  const choices: unknown = payload.choices;
  const firstChoice: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const message: unknown = isRecord(firstChoice)
    ? firstChoice.message
    : undefined;
  return {
    choicesCount: Array.isArray(choices) ? choices.length : 0,
    finishReason:
      isRecord(firstChoice) && typeof firstChoice.finish_reason === 'string'
        ? firstChoice.finish_reason
        : undefined,
    messageKeys: isRecord(message) ? Object.keys(message).sort() : [],
  };
}

function extractTextValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const text: string = value.trim();
    return text || undefined;
  }
  if (!Array.isArray(value)) return undefined;

  const text: string = value
    .map((part: unknown): string => {
      if (typeof part === 'string') return part;
      if (!isRecord(part)) return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.content === 'string') return part.content;
      return '';
    })
    .join('')
    .trim();
  return text || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
