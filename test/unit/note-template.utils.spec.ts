import { getNextPromptVersionNumber } from '../../server/modules/note-jobs/note-template.utils';
import { DEFAULT_NOTE_TEMPLATES } from '../../server/modules/note-jobs/note-template.defaults';

describe('note template version utilities', () => {
  it('starts published prompt version numbering at one', () => {
    expect(getNextPromptVersionNumber(null)).toBe(1);
  });

  it('increments the latest published prompt version number', () => {
    expect(getNextPromptVersionNumber(7)).toBe(8);
  });

  it('keeps learning modules adaptive instead of forcing ten chapters', () => {
    const content: string = DEFAULT_NOTE_TEMPLATES.learning.content;

    expect(content).toContain('标题与四个核心模块');
    expect(content).toContain('四个核心模块');
    expect(content).toContain('按证据决定是否输出');
    expect(content).not.toContain('会议议程');
    expect(content).not.toContain('会议内容');
    expect(content).not.toContain('会后待办');
    expect(content).not.toContain('必须包含全部 10 章');
  });

  it('keeps meeting notes in the fixed three-part structure', () => {
    const content: string = DEFAULT_NOTE_TEMPLATES.meeting.content;

    expect(content).toContain('只输出三个一级内容模块');
    expect(content).toContain('一、会议议程');
    expect(content).toContain('二、会议内容');
    expect(content).toContain('三、会后待办');
  });
});
