import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { localDatabase, root } from './local-db.mjs';

const command = process.argv[2];
if (!['start', 'status', 'stop', 'fixtures'].includes(command)) {
  throw new Error('Usage: node scripts/dev-db.mjs start|status|stop|fixtures');
}
const database = localDatabase({ create: command === 'start' });
switch (command) {
  case 'start':
    database.compose(['up', '--detach', '--wait', '--wait-timeout', '120']);
    console.log(`Villas PostgreSQL is ready on 127.0.0.1:${database.port()}.`);
    break;
  case 'status':
    database.compose(['ps']);
    break;
  case 'stop':
    database.compose(['down']);
    console.log('Stopped this checkout\'s database. Its volume and local credentials are retained.');
    break;
  case 'fixtures': {
    if (!process.env.VILLAS_LOCAL_INSTANCE && existsSync(`${root}/.env.local`)) loadEnvFile(`${root}/.env.local`);
    const businessId = process.env.VILLAS_PROPERTY_ID ?? 'villa-rosa';
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(businessId)) throw new Error('Set a valid explicit local fixture business ID.');
    const count = database.sql('SELECT (SELECT COUNT(*) FROM apartments) + (SELECT COUNT(*) FROM customers) + (SELECT COUNT(*) FROM reservations);');
    if (count !== '0') throw new Error('Fixtures require empty business tables. Existing records were not modified.');
    database.sql(readFileSync(`${root}/dev/fixtures.sql`, 'utf8').replaceAll('__VILLAS_FIXTURE_BUSINESS__', businessId));
    console.log('Loaded two synthetic rooms into this checkout\'s database. No guests or bookings were added.');
    break;
  }
}
