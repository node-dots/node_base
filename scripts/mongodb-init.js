// Виконується в mongosh: налаштування replica set зберігається у volume.
try {
  rs.status();
} catch (error) {
  if (error.code !== 94) throw error; // NotYetInitialized — набір ще не налаштований.
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] });
}

for (let attempt = 0; attempt < 60; attempt++) {
  if (db.hello().isWritablePrimary) {
    print('MongoDB готова до запису');
    quit(0);
  }
  sleep(500);
}
throw new Error('MongoDB не стала PRIMARY за 30 секунд');
