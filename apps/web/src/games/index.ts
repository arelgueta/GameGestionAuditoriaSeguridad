import type { ComponentType } from 'react';
import type { GameId, SessionMeta } from '@ciberjunta/shared';
import * as phish from './phish';
import * as crisis from './crisis';
import * as subasta from './subasta';
import * as escape from './escape';
import * as boardroom from './boardroom';
import * as shadowit from './shadowit';
import * as juicio from './juicio';

export interface GameViewProps {
  view: unknown;
  meta: SessionMeta;
}

export interface GameUi {
  Group: ComponentType<GameViewProps>;
  Host: ComponentType<GameViewProps>;
  Screen: ComponentType<GameViewProps>;
}

export const GAMES: Record<GameId, GameUi> = {
  phish,
  crisis,
  subasta,
  escape,
  boardroom,
  shadowit,
  juicio,
};
