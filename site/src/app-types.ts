export type TabId =
  | 'derive'
  | 'report'
  | 'chains'
  | 'compat'
  | 'phrases'
  | 'keys'
  | 'selfcheck';

export interface Ctx {
  go(tab: TabId): void;
}
