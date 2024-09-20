/// <reference types="vite/client" />
declare module '*.wgsl' {
  const content: string;
  export default content;
}

declare module 'stats-js' {
  export default class Stats {
    dom: HTMLDivElement;
    constructor();
    begin(): void;
    end(): void;
    update(): void;
  }
}
