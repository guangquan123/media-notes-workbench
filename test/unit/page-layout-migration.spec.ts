import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('page layout migration contracts', () => {
  const root = resolve(__dirname, '../..');
  const read = (file: string): string =>
    readFileSync(resolve(root, file), 'utf8');

  it('keeps the runtime Layout boundary unchanged while adding opt-in layout rules', () => {
    const layout = read('client/src/components/Layout.tsx');
    const styles = read('client/src/page-layout.css');

    expect(layout).toContain('data-launcher-page-ready="true"');
    expect(layout).toContain('/api/runtime/launcher-ready');
    expect(styles).toContain('.page-layout--task');
    expect(styles).toContain('.page-layout--settings');
    expect(styles).toContain('.page-layout--data');
  });

  it('uses natural content height for the entry cards instead of a fixed blank area', () => {
    const styles = read('client/src/index.css');

    expect(styles).toMatch(
      /\.entry-primary-stack\s*\{[\s\S]*?min-height:\s*0;/,
    );
    expect(styles).toMatch(
      /\.entry-card--featured\s*\{[\s\S]*?min-height:\s*0;/,
    );
    expect(styles).not.toContain('.entry-card--featured {\n    min-height: 334px;');
    expect(styles).toMatch(
      /@media \(min-width: 901px\) and \(max-height: 850px\)[\s\S]*?\.entry-primary-stack\s*\{[\s\S]*?align-content:\s*start;/,
    );
  });

  it('gives task pages a bounded desktop work area and restores document scroll on mobile', () => {
    const styles = read('client/src/page-layout.css');

    expect(styles).toContain('max-height: 100dvh');
    expect(styles).toContain('overflow-y: auto');
    expect(styles).toContain('@media (max-width: 1023px)');
    expect(styles).toContain('overflow: visible');
  });

  it('keeps the video task CTA within compact desktop panels', () => {
    const styles = read('client/src/page-layout.css');

    expect(styles).toMatch(
      /@media \(min-width: 1024px\) and \(max-height: 850px\)[\s\S]*?\.page-layout--task \.video-panel\s*\{[\s\S]*?padding:/,
    );
    expect(styles).toContain('.video-panel .space-y-5 > :not([hidden])');
    expect(styles).toContain(
      '.video-panel [aria-label="选择笔记风格"] > button',
    );
  });

  it('prevents prompt editors from expanding the settings page without a bound', () => {
    const styles = read('client/src/page-layout.css');
    const templates = read(
      'client/src/pages/NoteTemplatesPage/NoteTemplatesPage.tsx',
    );

    expect(styles).toContain('.note-template-editor');
    expect(styles).toContain('max-height: calc(100dvh - 18rem)');
    expect(templates).toContain('note-template-editor');
  });

  it('renders embedded settings pages as sections instead of nested main landmarks', () => {
    const sources: string[] = [
      read('client/src/pages/NoteTemplatesPage/NoteTemplatesPage.tsx'),
      read('client/src/pages/AiModelSettingsPage/AiModelSettingsPage.tsx'),
      read(
        'client/src/pages/TranscriptionSettingsPage/TranscriptionSettingsPage.tsx',
      ),
      read('client/src/pages/ConnectorSettingsPage/ConnectorSettingsPage.tsx'),
    ];

    for (const source of sources) {
      expect(source).toContain('embedded ?');
      expect(source).toContain('<Root');
    }
  });
});
