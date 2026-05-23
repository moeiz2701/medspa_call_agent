// packages/db/seed.ts
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Load the repo-root .env before importing the client.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../.env') });

const { db } = await import('./client');
const s = await import('./schema');

async function seed() {
  console.log('🌱 Seeding demo data...');

  // The spa
  const [spa] = await db.insert(s.spas).values({
    name: 'Aura Med Spa',
    timezone: 'America/New_York',
    phoneNumber: '+15555550100',  // Your real Twilio number
    transferNumber: '+15555550101',
    address: '142 Greene Street, New York, NY 10012',
    hoursJson: {
      mon: { open: '09:00', close: '19:00' },
      tue: { open: '09:00', close: '19:00' },
      wed: { open: '09:00', close: '19:00' },
      thu: { open: '09:00', close: '20:00' },
      fri: { open: '09:00', close: '20:00' },
      sat: { open: '10:00', close: '18:00' },
      sun: null,  // Closed
    },
  }).returning();

  if (!spa) throw new Error('Failed to insert spa');

  // Services — a realistic med spa menu
  const serviceData = [
    // Injectables
    { name: 'Botox - Full Treatment',  category: 'injectables', durationMinutes: 30, priceFrom: 14, priceTo: 18, priceUnit: 'per unit', requiresConsult: false },
    { name: 'Botox - Lip Flip',         category: 'injectables', durationMinutes: 30, priceFrom: 80, priceTo: 120, priceUnit: 'flat', requiresConsult: false },
    { name: 'Lip Filler',                category: 'injectables', durationMinutes: 60, priceFrom: 650, priceTo: 900, priceUnit: 'per syringe', requiresConsult: true },
    { name: 'Cheek Filler',              category: 'injectables', durationMinutes: 60, priceFrom: 750, priceTo: 1100, priceUnit: 'per syringe', requiresConsult: true },
    { name: 'Injectable Consultation',   category: 'injectables', durationMinutes: 30, priceFrom: 0,  priceTo: 0,    priceUnit: 'free',   requiresConsult: false },
    // Lasers
    { name: 'IPL Photofacial',           category: 'laser',       durationMinutes: 45, priceFrom: 350, priceTo: 450, priceUnit: 'flat',   requiresConsult: false },
    { name: 'Laser Hair Removal - Small Area', category: 'laser', durationMinutes: 30, priceFrom: 150, priceTo: 250, priceUnit: 'flat',   requiresConsult: false },
    // Facials
    { name: 'HydraFacial Signature',     category: 'facial',      durationMinutes: 50, priceFrom: 199, priceTo: 199, priceUnit: 'flat',   requiresConsult: false },
    { name: 'HydraFacial Deluxe',        category: 'facial',      durationMinutes: 75, priceFrom: 299, priceTo: 299, priceUnit: 'flat',   requiresConsult: false },
    { name: 'Chemical Peel',             category: 'facial',      durationMinutes: 45, priceFrom: 175, priceTo: 350, priceUnit: 'flat',   requiresConsult: false },
    // Body
    { name: 'CoolSculpting Consultation', category: 'body',       durationMinutes: 30, priceFrom: 0,   priceTo: 0,   priceUnit: 'free',   requiresConsult: false },
    // Wellness
    { name: 'IV Hydration Drip',         category: 'wellness',    durationMinutes: 45, priceFrom: 175, priceTo: 250, priceUnit: 'flat',   requiresConsult: false },
  ];
  const insertedServices = await db.insert(s.services)
    .values(serviceData.map(svc => ({ ...svc, spaId: spa.id })))
    .returning();

  // Providers
  const providerData = [
    { name: 'Jessica Martinez, NP',  title: 'Lead Nurse Injector',  bio: 'Specializes in lips and natural-looking results. 8 years of experience.' },
    { name: 'Dr. Aaron Chen, MD',    title: 'Medical Director',     bio: 'Board-certified physician overseeing all injectable treatments.' },
    { name: 'Maya Patel, LE',        title: 'Senior Esthetician',   bio: 'HydraFacial expert and chemical peel specialist.' },
    { name: 'Sophie Williams, RN',   title: 'Laser Specialist',     bio: 'IPL and laser hair removal certified.' },
  ];
  const insertedProviders = await db.insert(s.providers)
    .values(providerData.map(p => ({ ...p, spaId: spa.id })))
    .returning();

  // Provider ↔ service mapping
  const [jessica, aaron, maya, sophie] = insertedProviders;
  if (!jessica || !aaron || !maya || !sophie) throw new Error('Failed to insert providers');
  const svcByName = Object.fromEntries(insertedServices.map(svc => [svc.name, svc]));

  const mappings: [typeof jessica, string[]][] = [
    // Injectables: Jessica + Aaron
    [jessica, ['Botox - Full Treatment', 'Botox - Lip Flip', 'Lip Filler', 'Cheek Filler', 'Injectable Consultation']],
    [aaron,   ['Botox - Full Treatment', 'Lip Filler', 'Cheek Filler', 'Injectable Consultation']],
    // Facials & peels: Maya
    [maya,    ['HydraFacial Signature', 'HydraFacial Deluxe', 'Chemical Peel']],
    // Lasers: Sophie
    [sophie,  ['IPL Photofacial', 'Laser Hair Removal - Small Area']],
    // Wellness + body consults: shared
    [jessica, ['IV Hydration Drip', 'CoolSculpting Consultation']],
    [maya,    ['IV Hydration Drip']],
  ];

  for (const [provider, svcNames] of mappings) {
    for (const svcName of svcNames) {
      const svc = svcByName[svcName];
      if (!svc) continue;
      await db.insert(s.providerServices).values({
        providerId: provider.id,
        serviceId: svc.id,
      });
    }
  }

  // Schedules (Mon-Fri standard)
  for (const provider of insertedProviders) {
    for (let day = 1; day <= 5; day++) {
      await db.insert(s.providerSchedules).values({
        providerId: provider.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '18:00',
      });
    }
    // Saturday for Jessica + Maya
    if (provider.id === jessica.id || provider.id === maya.id) {
      await db.insert(s.providerSchedules).values({
        providerId: provider.id,
        dayOfWeek: 6,
        startTime: '10:00',
        endTime: '17:00',
      });
    }
  }

  // A few sample clients so "returning client" demos work
  await db.insert(s.clients).values([
    {
      spaId: spa.id,
      phone: '+15555551234',  // Use your own phone here for demos!
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah@example.com',
      preferredProviderId: jessica.id,
      vipFlag: true,
      notes: 'Prefers natural lip filler results. Sensitive to lidocaine.',
    },
  ]);

  console.log('✅ Demo data seeded');
  console.log(`   Spa: ${spa.name} (${spa.id})`);
  console.log(`   ${insertedServices.length} services, ${insertedProviders.length} providers`);
  console.log(`\n   Set DEMO_SPA_ID=${spa.id} in your .env`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
