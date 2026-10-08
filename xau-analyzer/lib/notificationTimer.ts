export function createNotificationTimer(onElapsed: () => void, duration: number) {
  let remaining = duration;
  let startedAt = 0;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function resume() {
    if (finished || timer !== null) return;
    startedAt = Date.now();
    timer = setTimeout(() => {
      timer = null;
      finished = true;
      onElapsed();
    }, remaining);
  }

  function pause() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  }

  function cancel() {
    pause();
    finished = true;
  }

  resume();
  return { pause, resume, cancel };
}
