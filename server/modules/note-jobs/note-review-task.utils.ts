interface ReviewTaskPayloadInput {
  documentUrl: string;
  jobId: string;
  larkOpenId: string;
  now: Date;
  title: string;
}

interface LarkTaskMember {
  id: string;
  role: 'assignee';
}

export interface LarkReviewTaskPayload {
  client_token: string;
  description: string;
  due: { is_all_day: boolean; timestamp: string };
  members: LarkTaskMember[];
  summary: string;
}

export function getShanghaiAllDayTimestamp(now: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  const values: Record<string, string> = {};
  parts.forEach((part: Intl.DateTimeFormatPart) => {
    values[part.type] = part.value;
  });
  return String(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
    ),
  );
}

export function buildReviewTaskPayload(
  input: ReviewTaskPayloadInput,
): LarkReviewTaskPayload {
  const title: string = input.title.slice(0, 120);
  return {
    client_token: `note-review-${input.jobId}`,
    description: `学习笔记已生成，请阅读、整理并移动到个人知识库。\n\n笔记链接：${input.documentUrl}`,
    due: {
      is_all_day: true,
      timestamp: getShanghaiAllDayTimestamp(input.now),
    },
    members: [{ id: input.larkOpenId, role: 'assignee' }],
    summary: `处理学习笔记：${title}`,
  };
}
