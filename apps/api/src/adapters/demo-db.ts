// apps/api/src/adapters/demo-db.ts
import { db } from '../db';
import * as s from '@medspa/db/schema';
import { and, eq, gt, lt } from 'drizzle-orm';
import { addMinutes, format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type {
  PMSAdapter,
  AvailabilityQuery,
  TimeSlot,
  ClientUpsertInput,
} from './types';

const SLOT_GRANULARITY_MIN = 15; // Slots start every 15 min

type SpaHours = Record<string, { open: string; close: string } | null>;

export class DemoDbAdapter implements PMSAdapter {
  async lookupClient(spaId: string, phone: string) {
    const result = await db
      .select({ client: s.clients, providerName: s.providers.name })
      .from(s.clients)
      .leftJoin(s.providers, eq(s.clients.preferredProviderId, s.providers.id))
      .where(and(eq(s.clients.spaId, spaId), eq(s.clients.phone, phone)))
      .limit(1);

    if (result.length === 0) return null;
    const r = result[0]!;
    return {
      id: r.client.id,
      firstName: r.client.firstName,
      lastName: r.client.lastName,
      phone: r.client.phone,
      preferredProviderId: r.client.preferredProviderId,
      preferredProviderName: r.providerName,
      vipFlag: r.client.vipFlag ?? false,
      notes: r.client.notes,
    };
  }

  async upsertClient(spaId: string, input: ClientUpsertInput) {
    const existing = await this.lookupClient(spaId, input.phone);
    if (existing) {
      await db
        .update(s.clients)
        .set({
          firstName: input.firstName ?? existing.firstName,
          lastName: input.lastName ?? existing.lastName,
          email: input.email,
          lastSeenAt: new Date(),
        })
        .where(eq(s.clients.id, existing.id));
      return (await this.lookupClient(spaId, input.phone))!;
    }
    const [created] = await db
      .insert(s.clients)
      .values({
        spaId,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
      })
      .returning();
    return (await this.lookupClient(spaId, created!.phone))!;
  }

  async listServices(spaId: string, opts: { category?: string } = {}) {
    const conditions = [eq(s.services.spaId, spaId), eq(s.services.active, true)];
    if (opts.category) conditions.push(eq(s.services.category, opts.category));
    const rows = await db.select().from(s.services).where(and(...conditions));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      durationMinutes: r.durationMinutes,
      priceFrom: r.priceFrom,
      priceTo: r.priceTo,
      priceUnit: r.priceUnit,
      requiresConsult: r.requiresConsult,
      description: r.description,
    }));
  }

  async listProviders(spaId: string, opts: { serviceId?: string } = {}) {
    if (opts.serviceId) {
      const rows = await db
        .select({ provider: s.providers })
        .from(s.providers)
        .innerJoin(s.providerServices, eq(s.providerServices.providerId, s.providers.id))
        .where(
          and(
            eq(s.providers.spaId, spaId),
            eq(s.providers.active, true),
            eq(s.providerServices.serviceId, opts.serviceId),
          ),
        );
      return rows.map((r) => ({
        id: r.provider.id,
        name: r.provider.name,
        title: r.provider.title,
      }));
    }
    const rows = await db
      .select()
      .from(s.providers)
      .where(and(eq(s.providers.spaId, spaId), eq(s.providers.active, true)));
    return rows.map((r) => ({ id: r.id, name: r.name, title: r.title }));
  }

  async getAvailability(q: AvailabilityQuery): Promise<TimeSlot[]> {
    const [spa] = await db.select().from(s.spas).where(eq(s.spas.id, q.spaId));
    if (!spa) throw new Error('Spa not found');
    const tz = spa.timezone;

    const [service] = await db.select().from(s.services).where(eq(s.services.id, q.serviceId));
    if (!service) throw new Error('Service not found');

    // Which providers can do this service?
    const eligibleProviders = await this.listProviders(q.spaId, { serviceId: q.serviceId });
    const providers = q.providerId
      ? eligibleProviders.filter((p) => p.id === q.providerId)
      : eligibleProviders;

    const slots: TimeSlot[] = [];
    const maxSlots = q.maxSlots ?? 6;
    const hours = spa.hoursJson as SpaHours;

    // Iterate day by day in the spa's timezone
    for (
      let day = new Date(q.rangeStart);
      day <= q.rangeEnd && slots.length < maxSlots;
      day.setDate(day.getDate() + 1)
    ) {
      const localDay = toZonedTime(day, tz);
      const dow = localDay.getDay();

      // Is the spa open?
      const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dow]!;
      const spaHours = hours[dayKey];
      if (!spaHours) continue;

      for (const provider of providers) {
        if (slots.length >= maxSlots) break;

        // Provider's schedule that day
        const [sched] = await db
          .select()
          .from(s.providerSchedules)
          .where(
            and(
              eq(s.providerSchedules.providerId, provider.id),
              eq(s.providerSchedules.dayOfWeek, dow),
            ),
          );
        if (!sched) continue;

        // Working window = provider hours that day (within spa open hours)
        const dayStr = format(localDay, 'yyyy-MM-dd');
        const winStart = fromZonedTime(`${dayStr}T${sched.startTime}:00`, tz);
        const winEnd = fromZonedTime(`${dayStr}T${sched.endTime}:00`, tz);

        // Existing appointments overlapping this provider's working window.
        // Use absolute-instant overlap (same shape as createAppointment's
        // conflict check) instead of server-local day boundaries — otherwise
        // server-tz ≠ spa-tz drops bookings whose startsAt crosses the
        // server's midnight, and slots get reported as free when they aren't.
        const dayBookings = await db
          .select()
          .from(s.appointments)
          .where(
            and(
              eq(s.appointments.providerId, provider.id),
              eq(s.appointments.status, 'scheduled'),
              lt(s.appointments.startsAt, winEnd),
              gt(s.appointments.endsAt, winStart),
            ),
          );

        // Walk the day in granularity steps
        let cursor = new Date(winStart);
        const serviceDuration = service.durationMinutes;
        const mins = cursor.getMinutes();
        const remainder = mins % SLOT_GRANULARITY_MIN;
        if (remainder !== 0) cursor = addMinutes(cursor, SLOT_GRANULARITY_MIN - remainder);

        while (addMinutes(cursor, serviceDuration) <= winEnd && slots.length < maxSlots) {
          const slotStart = new Date(cursor);
          const slotEnd = addMinutes(slotStart, serviceDuration);

          // Must be in the future
          if (slotStart <= new Date()) {
            cursor = addMinutes(cursor, SLOT_GRANULARITY_MIN);
            continue;
          }

          // Conflict check
          const conflict = dayBookings.some(
            (b) => slotStart < b.endsAt && slotEnd > b.startsAt,
          );
          if (!conflict) {
            slots.push({
              startsAt: slotStart,
              endsAt: slotEnd,
              providerId: provider.id,
              providerName: provider.name,
            });
          }
          cursor = addMinutes(cursor, SLOT_GRANULARITY_MIN);
        }
      }
    }

    return slots;
  }

  async createAppointment(input: {
    spaId: string;
    clientId: string;
    serviceId: string;
    providerId: string;
    startsAt: Date;
    callId?: string;
  }) {
    const [service] = await db.select().from(s.services).where(eq(s.services.id, input.serviceId));
    if (!service) throw new Error('Service not found');

    const endsAt = addMinutes(input.startsAt, service.durationMinutes);

    // Re-check availability inside a transaction to prevent double-booking
    const [appt] = await db.transaction(async (tx) => {
      const conflicts = await tx
        .select()
        .from(s.appointments)
        .where(
          and(
            eq(s.appointments.providerId, input.providerId),
            eq(s.appointments.status, 'scheduled'),
            lt(s.appointments.startsAt, endsAt),
            gt(s.appointments.endsAt, input.startsAt),
          ),
        );
      if (conflicts.length > 0) throw new Error('SLOT_NO_LONGER_AVAILABLE');

      const estimatedValue = service.priceFrom ?? 0;
      return tx
        .insert(s.appointments)
        .values({
          spaId: input.spaId,
          clientId: input.clientId,
          serviceId: input.serviceId,
          providerId: input.providerId,
          startsAt: input.startsAt,
          endsAt,
          estimatedValue,
          createdViaCallId: input.callId,
        })
        .returning();
    });

    // Fetch enriched info
    const [enriched] = await db
      .select({
        appt: s.appointments,
        svcName: s.services.name,
        providerName: s.providers.name,
        firstName: s.clients.firstName,
        lastName: s.clients.lastName,
      })
      .from(s.appointments)
      .innerJoin(s.services, eq(s.appointments.serviceId, s.services.id))
      .innerJoin(s.providers, eq(s.appointments.providerId, s.providers.id))
      .innerJoin(s.clients, eq(s.appointments.clientId, s.clients.id))
      .where(eq(s.appointments.id, appt!.id));

    return {
      id: enriched!.appt.id,
      startsAt: enriched!.appt.startsAt,
      endsAt: enriched!.appt.endsAt,
      serviceName: enriched!.svcName,
      providerName: enriched!.providerName,
      clientName:
        `${enriched!.firstName ?? ''} ${enriched!.lastName ?? ''}`.trim() || 'Guest',
    };
  }
}

export const pms = new DemoDbAdapter();
