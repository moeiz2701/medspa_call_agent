// apps/api/src/lib/events.ts
import { EventEmitter } from 'node:events';
import type { LiveEvent } from '@medspa/shared';

class LiveBus extends EventEmitter {
  publish(event: LiveEvent) { this.emit('event', event); }
  subscribe(cb: (e: LiveEvent) => void) {
    this.on('event', cb);
    return () => this.off('event', cb);
  }
}

export const liveBus = new LiveBus();
liveBus.setMaxListeners(100);
