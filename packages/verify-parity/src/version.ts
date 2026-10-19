/** Version of the parity schemas, canonical forms and record shapes. */
export const PARITY_VERSION = '0.1.0' as const;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
