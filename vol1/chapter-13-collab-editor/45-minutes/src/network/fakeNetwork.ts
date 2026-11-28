/*
 * NOT PART OF THE INTERVIEW.
 * A network between editors that lives in the page. Each side has a delay
 * and can go offline. Messages for or from an offline side wait, and are
 * delivered in order when it comes back.
 */
import type { Op, Transport } from "../collab";

export interface NetworkStats {
  /** Operations each site has sent. */
  sent: Record<string, number>;
  /** Operations each site has received. */
  received: Record<string, number>;
  /** Operations that are still on their way. */
  inFlight: number;
}

export interface FakeNetwork {
  transportFor(site: string): Transport;
  /** How long a message from this site travels, in milliseconds. */
  setDelay(site: string, ms: number): void;
  setOnline(site: string, online: boolean): void;
  getStats(): NetworkStats;
  /** Calls the listener when the numbers change. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /** Stops every timer. */
  dispose(): void;
}

interface Message {
  ops: Op[];
  dueAt: number;
}

/** The messages on their way from one site to another, oldest first. */
interface Link {
  from: string;
  to: string;
  queue: Message[];
  timer: ReturnType<typeof setTimeout> | null;
}

export function createFakeNetwork(sites: string[]): FakeNetwork {
  const delays = new Map<string, number>();
  const offline = new Set<string>();
  const receivers = new Map<string, Set<(ops: Op[]) => void>>();
  const statsListeners = new Set<() => void>();
  const links: Link[] = [];
  let stats: NetworkStats = { sent: {}, received: {}, inFlight: 0 };

  for (const from of sites) {
    stats.sent[from] = 0;
    stats.received[from] = 0;
    for (const to of sites) {
      if (from !== to) {
        links.push({ from, to, queue: [], timer: null });
      }
    }
  }

  function changeStats(change: (old: NetworkStats) => NetworkStats): void {
    stats = change(stats);
    statsListeners.forEach((listener) => listener());
  }

  /** Delivers every message of the link that is due, and sets a timer for the next one. */
  function pump(link: Link): void {
    if (link.timer !== null) {
      clearTimeout(link.timer);
      link.timer = null;
    }
    if (offline.has(link.from) || offline.has(link.to)) {
      return;
    }

    while (link.queue.length > 0 && link.queue[0].dueAt <= Date.now()) {
      // The check above says the queue is not empty.
      const message = link.queue.shift()!;
      changeStats((old) => ({
        ...old,
        received: { ...old.received, [link.to]: old.received[link.to] + message.ops.length },
        inFlight: old.inFlight - message.ops.length,
      }));
      receivers.get(link.to)?.forEach((receive) => receive(message.ops));
    }

    if (link.queue.length > 0) {
      link.timer = setTimeout(() => pump(link), link.queue[0].dueAt - Date.now());
    }
  }

  return {
    transportFor(site) {
      return {
        send(ops) {
          for (const link of links.filter((candidate) => candidate.from === site)) {
            // Never earlier than the message before it: a link keeps its order.
            const last = link.queue[link.queue.length - 1];
            const dueAt = Math.max(Date.now() + (delays.get(site) ?? 0), last?.dueAt ?? 0);
            link.queue.push({ ops, dueAt });
            changeStats((old) => ({
              ...old,
              sent: { ...old.sent, [site]: old.sent[site] + ops.length },
              inFlight: old.inFlight + ops.length,
            }));
            pump(link);
          }
        },
        subscribe(onOps) {
          const listeners = receivers.get(site) ?? new Set();
          receivers.set(site, listeners);
          listeners.add(onOps);
          return () => listeners.delete(onOps);
        },
      };
    },
    setDelay(site, ms) {
      delays.set(site, ms);
    },
    setOnline(site, online) {
      if (online) {
        offline.delete(site);
      } else {
        offline.add(site);
      }
      links.forEach(pump);
    },
    getStats: () => stats,
    subscribe(listener) {
      statsListeners.add(listener);
      return () => statsListeners.delete(listener);
    },
    dispose() {
      links.forEach((link) => {
        if (link.timer !== null) {
          clearTimeout(link.timer);
        }
        link.timer = null;
      });
    },
  };
}
