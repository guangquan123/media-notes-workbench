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

export const MAX_EXTERNAL_MODEL_OUTPUT_TOKENS = 65_536;

export function getExternalModelOutputTokenBudgets(
  initialMaxTokens: number,
): number[] {
  const budgets: number[] = [initialMaxTokens];
  for (const candidate of [
    Math.max(initialMaxTokens * 2, 32_768),
    MAX_EXTERNAL_MODEL_OUTPUT_TOKENS,
  ]) {
    if (
      candidate > initialMaxTokens &&
      candidate <= MAX_EXTERNAL_MODEL_OUTPUT_TOKENS &&
      !budgets.includes(candidate)
    ) {
      budgets.push(candidate);
    }
  }
  return budgets;
}

export function isReasoningOnlyLengthLimitedResponse(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const choices: unknown = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return false;
  const firstChoice: unknown = choices[0];
  if (!isRecord(firstChoice) || firstChoice.finish_reason !== 'length') {
    return false;
  }
  const message: unknown = firstChoice.message;
  if (!isRecord(message)) return false;
  return (
    !extractExternalModelText(payload) &&
    typeof message.reasoning_content === 'string' &&
    Boolean(message.reasoning_content.trim())
  );
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
