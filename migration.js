import * as store from './store.js';
import {createMigration} from './migration-core.js';
const local=createMigration(store);
export const previewLegacy=local.previewLegacy;
export const importLegacy=(preview)=>store.demo?local.importLegacy(preview):store.command('importLegacy',[preview]);
export const restoreBackup=(backup)=>store.demo?local.restoreBackup(backup):store.command('restoreBackup',[backup]);
