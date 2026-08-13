import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// 本地模式使用 PGlite（内嵌 Postgres），运行时与 PostgresJs 查询语义一致；
// 这里用 PostgresJsDatabase 作为统一类型，本地 PGlite 实例在工厂中做安全断言。
export type AppDatabase = PostgresJsDatabase;
