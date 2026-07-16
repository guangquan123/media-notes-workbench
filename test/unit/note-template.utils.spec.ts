import { getNextPromptVersionNumber } from '../../server/modules/note-jobs/note-template.utils';

describe('note template version utilities', () => {
  it('starts published prompt version numbering at one', () => {
    expect(getNextPromptVersionNumber(null)).toBe(1);
  });

  it('increments the latest published prompt version number', () => {
    expect(getNextPromptVersionNumber(7)).toBe(8);
  });
});
