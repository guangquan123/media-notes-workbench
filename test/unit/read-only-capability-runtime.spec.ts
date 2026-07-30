import { resolve } from 'node:path';

import { createReadOnlyCapabilityRuntime } from '../../server/common/utils/read-only-capability-runtime';

describe('createReadOnlyCapabilityRuntime', () => {
  it('loads configured capabilities without starting the application', async () => {
    const runtime = await createReadOnlyCapabilityRuntime(
      resolve(process.cwd(), 'server/capabilities'),
    );

    try {
      expect(
        runtime.capabilityService.getCapability(
          'note-summary-pipeline-writer',
        ),
      ).toMatchObject({
        pluginKey: '@official-plugins/ai-text-generate',
      });
    } finally {
      await runtime.close();
    }
  });
});
