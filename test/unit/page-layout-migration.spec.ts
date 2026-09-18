import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('page layout migration contracts', () => {
  const root = resolve(__dirname, '../..');
  const read = (file: string): string =>
    readFileSync(resolve(root, file), 'utf8');

  it('keeps the runtime Layout boundary unchanged while adding opt-in layout rules', () => {
    const layout = read('client/src/components/Layout.tsx');
    const styles = read('client/src/page-layout.css');
    const entry = read('client/src/index.tsx');

    expect(layout).toContain('data-launcher-page-ready="true"');
    expect(layout).toContain('/api/runtime/launcher-ready');
    expect(styles).toContain('.page-layout--task');
    expect(styles).toContain('.page-layout--settings');
    expect(styles).toContain('.page-layout--data');
    expect(styles).toContain('.guided-page__container');
    expect(entry).toContain("import './page-layout.css';");
  });

  it('keeps guided task surfaces on the available desktop canvas', () => {
    const sources: string[] = [
      read('client/src/pages/SetupPage/SetupPage.tsx'),
      read('client/src/pages/RecordingNotesPage/RecordingNotesPage.tsx'),
      read('client/src/pages/MediaNotePage/MediaNotePage.tsx'),
      read('client/src/pages/PairedMediaNotesPage/PairedMediaNotesPage.tsx'),
    ];

    for (const source of sources) {
      expect(source).toContain('guided-page__container');
      expect(source).toContain('max-w-none');
    }
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

  it('keeps task pages in natural document flow so content and CTA cannot be clipped', () => {
    const styles = read('client/src/page-layout.css');

    expect(styles).toContain('max-height: none');
    expect(styles).toContain('.page-layout--task .page-layout__panel');
    expect(styles).toContain('overflow: visible');
    expect(styles).not.toMatch(
      /@media \(min-width: 1024px\)[\s\S]*?\.page-layout--task\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(styles).not.toMatch(
      /\.page-layout--task \.page-layout__panel\s*\{[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(styles).toContain('@media (max-width: 1023px)');
  });

  it('keeps the video task CTA in normal flow within compact desktop panels', () => {
    const styles = read('client/src/page-layout.css');

    expect(styles).toMatch(
      /@media \(min-width: 1024px\) and \(max-height: 850px\)[\s\S]*?\.page-layout--task \.video-panel\s*\{[\s\S]*?padding:/,
    );
    expect(styles).toContain('.video-panel .space-y-5 > :not([hidden])');
    expect(styles).toContain(
      '.video-panel [aria-label="选择笔记风格"] > button',
    );
    expect(styles).toContain('.video-panel .video-submit');
    expect(styles).not.toMatch(
      /\.page-layout--task \.video-panel \.video-submit\s*\{[\s\S]*?position:\s*sticky;/,
    );
  });

  it('protects media detail pages from parent clipping and nested panel scrolling', () => {
    const styles = read('client/src/pages/MediaNotePage/detail-pages-compact.css');

    expect(styles).toMatch(
      /\.media-note-page,[\s\S]*?\.paired-media-page\s*\{[\s\S]*?overflow:\s*visible;/,
    );
    expect(styles).toMatch(
      /\.media-note-page__panel,[\s\S]*?\.paired-media-page__panel\s*\{[\s\S]*?overflow:\s*visible;/,
    );
    expect(styles).toContain('.media-note-page__container');
  });

  it('uses one compact height contract for both homepage entry columns', () => {
    const styles = read('client/src/index.css');

    expect(styles).toMatch(
      /@media \(min-width: 901px\) and \(max-height: 850px\)[\s\S]*?\.entry-secondary-grid\s*\{[\s\S]*?height:\s*338px;/,
    );
    expect(styles).toMatch(
      /@media \(min-width: 901px\) and \(max-height: 850px\)[\s\S]*?\.entry-secondary-grid \.entry-card\s*\{[\s\S]*?min-height:\s*0;/,
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

  it('keeps settings navigation visible while long model content scrolls', () => {
    const settings = read('client/src/pages/SettingsPage/SettingsPage.tsx');
    const models = read(
      'client/src/pages/AiModelSettingsPage/AiModelSettingsPage.tsx',
    );

    expect(settings).toContain('lg:sticky');
    expect(settings).toContain('lg:max-h-[calc(100vh-5rem)]');
    const layout = read('client/src/components/Layout.tsx');
    expect(layout).toContain("location.pathname === '/'");
    expect(models).toContain('转录模型');
    expect(models).toContain('总结模型');
    expect(models).toContain('role="tablist"');
  });

  it('defaults the recording review player to the original full recording', () => {
    const panels = read(
      'client/src/pages/RecordingNotesPage/RecordingPanels.tsx',
    );

    expect(panels).toContain(
      'const [smartPlayback, setSmartPlayback] = useState<boolean>(false);',
    );
    expect(panels).toContain('切换为完整播放');
  });
});
