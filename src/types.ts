export type GameStatus = 'START' | 'PLAYING' | 'WON' | 'LOST';

export interface Point {
  x: number;
  y: number;
}

export interface Rocket {
  id: string;
  start: Point;
  current: Point;
  target: Point;
  speed: number;
  destroyed: boolean;
}

export interface Interceptor {
  id: string;
  start: Point;
  current: Point;
  target: Point;
  speed: number;
  reached: boolean;
}

export interface Explosion {
  id: string;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  growing: boolean;
  done: boolean;
}

export interface City {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  destroyed: boolean;
}

export interface Battery {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ammo: number;
  maxAmmo: number;
  destroyed: boolean;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  opacity: number;
  life: number;
}

export interface Language {
  title: string;
  start: string;
  restart: string;
  win: string;
  loss: string;
  score: string;
  ammo: string;
  instructions: string;
  level: string;
  nextRound: string;
  performance: string;
}
