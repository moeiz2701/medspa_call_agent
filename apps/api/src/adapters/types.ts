// apps/api/src/adapters/types.ts
export interface PMSAdapter {
  lookupClient(spaId: string, phone: string): Promise<ClientInfo | null>;
  upsertClient(spaId: string, input: ClientUpsertInput): Promise<ClientInfo>;
  listServices(spaId: string, opts?: { category?: string }): Promise<ServiceInfo[]>;
  listProviders(spaId: string, opts?: { serviceId?: string }): Promise<ProviderInfo[]>;
  getAvailability(input: AvailabilityQuery): Promise<TimeSlot[]>;
  createAppointment(input: AppointmentInput): Promise<AppointmentInfo>;
}

export interface ClientInfo {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  preferredProviderId: string | null;
  preferredProviderName?: string | null;
  vipFlag: boolean;
  lastVisitDate?: Date | null;
  notes: string | null;
}

export interface ServiceInfo {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  priceFrom: number | null;
  priceTo: number | null;
  priceUnit: string | null;
  requiresConsult: boolean;
  description: string | null;
}

export interface ProviderInfo {
  id: string;
  name: string;
  title: string | null;
}

export interface AvailabilityQuery {
  spaId: string;
  serviceId: string;
  providerId?: string;
  rangeStart: Date;
  rangeEnd: Date;
  maxSlots?: number;
}

export interface TimeSlot {
  startsAt: Date;
  endsAt: Date;
  providerId: string;
  providerName: string;
}

export interface AppointmentInput {
  spaId: string;
  clientId: string;
  serviceId: string;
  providerId: string;
  startsAt: Date;
  callId?: string;
}

export interface AppointmentInfo {
  id: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  providerName: string;
  clientName: string;
}

export interface ClientUpsertInput {
  spaId: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}
