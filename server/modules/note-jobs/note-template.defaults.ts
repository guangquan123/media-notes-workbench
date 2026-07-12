import type { NoteStyle } from '@shared/api.interface';

interface NoteTemplateDefault {
  content: string;
  description: string;
  label: string;
}

export const DEFAULT_NOTE_TEMPLATES: Record<NoteStyle, NoteTemplateDefault> = {
  learning: {
    label: '学习笔记',
    description: '适用于课程、书籍、报告、论文、技术资料与系统性复盘。',
    content: `目标：将原文加工成可复习、可迁移的通用学习笔记，而不是按时间顺序复述。\n\n输出重点：\n1. 先说明资料解决的问题、核心思想和 3—5 条关键观点。\n2. 用“一级主题 → 二级知识点 → 关键概念/关系”呈现知识框架。\n3. 深入说明背景、核心概念、方法论、案例、适用场景、边界与常见误区。\n4. 保留原文中的条件、数字、步骤、例外和案例；原文未提供时明确标注，不补写。\n5. 产出行动清单：下一步可以学习、实践或应用什么。\n6. 所有不确定的术语、数字或结论标记【待人工确认】。`,
  },
  meeting: {
    label: '会议纪要',
    description: '适用于会议录音、访谈、讨论和项目同步资料。',
    content: `目标：将原文整理成可跟进、可执行的会议纪要，不按发言顺序逐字复述。\n\n输出重点：\n1. 按议题整理讨论背景、关键分歧和已达成结论。\n2. 明确列出决策、待办、负责人和截止时间。\n3. 原文没有明确负责人、时间或结论时标记【待人工确认】，不得推测。\n4. 保留关键数字、条件、风险、依赖项和需要升级决策的问题。\n5. 结尾给出下一步跟进清单，便于直接执行。`,
  },
};
