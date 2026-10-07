import type { GameId } from '@ciberjunta/shared';
import type { AnyModule } from '../engine/types.js';
import { boardroomModule } from './boardroom.js';
import { crisisModule } from './crisis.js';
import { escapeModule } from './escape.js';
import { juicioModule } from './juicio.js';
import { phishModule } from './phish.js';
import { shadowitModule } from './shadowit.js';
import { subastaModule } from './subasta.js';

const modules: Record<GameId, AnyModule> = {
  phish: phishModule,
  crisis: crisisModule,
  subasta: subastaModule,
  escape: escapeModule,
  boardroom: boardroomModule,
  shadowit: shadowitModule,
  juicio: juicioModule,
};

export function getModule(id: GameId): AnyModule {
  return modules[id];
}
