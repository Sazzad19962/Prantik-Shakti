'use strict';

const { loadConfig } = require('./src/config');
const { createStore } = require('./src/store');
const { createApp, bootstrap } = require('./src/app');

async function main() {
  const { config, problems, warnings } = loadConfig();
  for (const w of warnings) console.warn('\n⚠️  ' + w);
  if (problems.length) {
    for (const p of problems) console.error('✖ ' + p);
    console.error('সার্ভার চালু করা হলো না। README.md-এর “পরিবেশ-চলক” অংশ দেখুন।');
    process.exit(1);
  }

  const store = createStore(config);
  await store.init();
  const app = createApp({ config, store });
  await bootstrap(store, config, app.locals.contentSvc);

  const server = app.listen(config.port, () => {
    console.log(`\nপ্রান্তিক শক্তি ওয়েবসাইট চালু: http://localhost:${config.port}  (অ্যাডমিন: /admin, স্টোরেজ: ${store.kind === 'mongodb' ? 'MongoDB' : 'লোকাল JSON — ' + config.dataDir})`);
  });

  const shutdown = () => {
    server.close(async () => { await store.close().catch(() => {}); process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('✖ সার্ভার চালু করা যায়নি:', err && err.message ? err.message : err);
  process.exit(1);
});
