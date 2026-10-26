// SSE 订阅：自动重连 + 首次快照兜底
export function connect(onData, onStatus) {
  let es = null;
  let closed = false;

  const open = () => {
    if (closed) return;
    es = new EventSource('/api/stream');
    es.onopen = () => onStatus?.(true);
    es.addEventListener('data', (e) => {
      try {
        onData(JSON.parse(e.data));
      } catch {
        /* 忽略坏帧 */
      }
    });
    es.onerror = () => {
      onStatus?.(false);
      es.close();
      setTimeout(open, 3000);
    };
  };

  // 先拉一次快照，SSE 建立前也有数据可看
  fetch('/api/snapshot')
    .then((r) => r.json())
    .then((json) => onData({ type: 'snapshot', ...json }))
    .catch(() => {});

  open();
  return () => {
    closed = true;
    es?.close();
  };
}
