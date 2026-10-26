import { useEffect, useRef, useState } from 'react';

// 数值变动闪色：数值变化后 1.2 秒内返回对应方向 class
export function useFlash(value, ms = 1200) {
  const prev = useRef(value);
  const [cls, setCls] = useState('');
  useEffect(() => {
    const p = prev.current;
    prev.current = value;
    if (Number.isFinite(value) && Number.isFinite(p) && value !== p) {
      setCls(value > p ? 'flash-up' : 'flash-down');
      const t = setTimeout(() => setCls(''), ms);
      return () => clearTimeout(t);
    }
  }, [value, ms]);
  return cls;
}
