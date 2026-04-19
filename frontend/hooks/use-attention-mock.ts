import { useCallback, useMemo, useState } from 'react';
import type { AttentionItem, AttentionSeverity } from '@/components/mc';

let idCounter = 1000;
const nextId = () => `mock-${++idCounter}`;

const SAMPLE_AMBER = [
  { title: '#1248 · Room 3 · $83.50', detail: 'Jin Kim · CARD' },
  { title: '#1246 · Room 1 · $127.00', detail: 'Han Sung · CARD' },
  { title: '#1242 · Room 2 · $65.00', detail: 'Sarah Lee · GIFT CARD' },
  { title: '#1239 · Room 4 · $214.25', detail: 'Alex Park · CARD' },
];

const SAMPLE_RED = [
  { title: 'OCR Pi offline', detail: 'No heartbeat for 7 min' },
  { title: '#1244 · Room 2 · $92.00', detail: 'Unpaid 23 min past end time' },
];

function seed(): AttentionItem[] {
  const now = Date.now();
  return [
    {
      id: nextId(),
      kind: 'missing_receipt',
      severity: 'amber',
      title: SAMPLE_AMBER[0].title,
      detail: `Completed 14 min ago · ${SAMPLE_AMBER[0].detail}`,
      linkHref: '/pos/bookings/demo-1248',
      createdAt: new Date(now - 14 * 60_000).toISOString(),
    },
    {
      id: nextId(),
      kind: 'missing_receipt',
      severity: 'amber',
      title: SAMPLE_AMBER[1].title,
      detail: `Completed 38 min ago · ${SAMPLE_AMBER[1].detail}`,
      linkHref: '/pos/bookings/demo-1246',
      createdAt: new Date(now - 38 * 60_000).toISOString(),
    },
    {
      id: nextId(),
      kind: 'pi_unreachable',
      severity: 'red',
      title: SAMPLE_RED[0].title,
      detail: SAMPLE_RED[0].detail,
      createdAt: new Date(now - 7 * 60_000).toISOString(),
    },
  ];
}

export function useAttentionMock() {
  const [items, setItems] = useState<AttentionItem[]>(() => seed());
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [resolving, setResolving] = useState<Set<string>>(() => new Set());

  const unreadCount = useMemo(
    () => items.filter((i) => !readIds.has(i.id)).length,
    [items, readIds],
  );

  const addItem = useCallback((severity: AttentionSeverity) => {
    setItems((prev) => {
      const bank = severity === 'red' ? SAMPLE_RED : SAMPLE_AMBER;
      const pick = bank[Math.floor(Math.random() * bank.length)];
      const item: AttentionItem = {
        id: nextId(),
        kind: severity === 'red' ? 'pi_unreachable' : 'missing_receipt',
        severity,
        title: pick.title,
        detail:
          severity === 'red'
            ? pick.detail
            : `Completed just now · ${pick.detail}`,
        linkHref: severity === 'red' ? undefined : `/pos/bookings/demo-${idCounter}`,
        createdAt: new Date().toISOString(),
      };
      return [item, ...prev];
    });
  }, []);

  const resolveLatest = useCallback(() => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[0].id;
      setResolving((r) => {
        const next = new Set(r);
        next.add(target);
        return next;
      });
      window.setTimeout(() => {
        setItems((p) => p.filter((i) => i.id !== target));
        setResolving((r) => {
          const next = new Set(r);
          next.delete(target);
          return next;
        });
      }, 360);
      return prev;
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setReadIds(new Set());
    setResolving(new Set());
  }, []);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds(new Set(items.map((i) => i.id)));
  }, [items]);

  return {
    items,
    readIds,
    resolving,
    unreadCount,
    addItem,
    resolveLatest,
    clearAll,
    markRead,
    markAllRead,
  };
}
