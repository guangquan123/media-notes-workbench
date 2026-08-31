export function runBackgroundTask(
  task: () => Promise<void>,
  reportError: (error: unknown) => void,
): void {
  void Promise.resolve().then(task).catch(reportError);
}
