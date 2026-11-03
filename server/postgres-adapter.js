/** Cloudflare D1-compatible query interface backed by Netlify managed Postgres.
 * All query strings are application constants. Parameters stay bound, never concatenated.
 */
export function createAdapter(pool) {
  const convert = (statement) => {
    let index=0;
    return statement.replace(/\?/g, () => '$'+(++index));
  };
  function prepare(sql) {
    const query=convert(sql);
    return {bind(...values){
      async function execute() {return pool.query(query, values);}
      return {
        async first(){ const r=await execute();return r.rows[0]||null; },
        async all(){ const r=await execute();return {results:r.rows}; },
        async run(){ const r=await execute();return {meta:{changes:r.rowCount||0}}; }
      };
    }};
  }
  return {prepare,async batch(queries){return Promise.all(queries.map(q=>q.run()));}};
}