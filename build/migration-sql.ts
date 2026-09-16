/** Preserve applied source migrations; normalize only their deployment copies. */
export function deploymentSql(source: string, filename: string): string {
  let sql = source.replace(/\r\n?/g, '\n');
  if (filename === '0000_futuristic_silk_fever.sql') {
    // D1 can mistake an unparenthesized CASE's END for the trigger's END.
    // https://github.com/cloudflare/workers-sdk/issues/4727
    sql = sql.replace('SELECT CASE WHEN NOT EXISTS', 'SELECT (CASE WHEN NOT EXISTS')
      .replace("THEN RAISE(ABORT, 'Stock or price changed') END;", "THEN RAISE(ABORT, 'Stock or price changed') END);");
  }
  return sql;
}
