export function testDatabaseConfigured(): boolean {
  return Boolean((process.env.DATABASE_URL ?? '').trim());
}
